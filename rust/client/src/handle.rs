use futures_util::FutureExt;
use tokio_tungstenite::{WebSocketStream, MaybeTlsStream};
use anyhow::Result;
use std::ops::Deref;
use std::sync::atomic::{AtomicI64, Ordering};
use std::{collections::HashMap, sync::Arc};
use tokio::sync::{oneshot, Mutex};
use serde_json::{json, Value};

use crate::drivers::{DriverHandle, DriverStopReason, TransportKind};
use crate::encoding::EncodingKind;
use crate::protocol::*;

use super::protocol;

pub enum ConnectionTransport {
    WebSocket(WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>)
}

type RpcResponse = Result<RpcResponseOk, RpcResponseError>;
type EventCallback = dyn Fn(&Vec<Value>) + Send + Sync;

struct SendMsgOpts {
    ephemeral: bool
}

impl Default for SendMsgOpts {
    fn default() -> Self {
        Self { ephemeral: false }
    }
}

pub type ActorHandle = Arc<ActorHandleInner>;

pub struct ActorHandleInner {
    pub endpoint: String,
    transport_kind: TransportKind,
    encoding_kind: EncodingKind,
    driver: Mutex<Option<DriverHandle>>,
    msg_queue: Mutex<Vec<Arc<protocol::ToServer>>>,
    rpc_counter: AtomicI64,
    /// Map between rpc id and resolution channel
    in_flight_rpcs: Mutex<HashMap<
        i64,
        oneshot::Sender<RpcResponse>
    >>,
    event_subscriptions: Mutex<HashMap<
        String, Vec<Box<EventCallback>>
    >>,
}

impl ActorHandleInner {
    pub(crate) fn new(
        endpoint: String,
        transport_kind: TransportKind,
        encoding_kind: EncodingKind,
    ) -> Result<ActorHandle> {
        Ok(Arc::new(Self {
            endpoint: endpoint.clone(),
            transport_kind,
            encoding_kind,
            driver: Mutex::new(None),
            msg_queue: Mutex::new(Vec::new()),
            rpc_counter: AtomicI64::new(0),
            in_flight_rpcs: Mutex::new(HashMap::new()),
            event_subscriptions: Mutex::new(HashMap::new()),
        }))
    }

    async fn connect_inner(self: &Arc<Self>) -> Result<()> {
        let (driver, mut recver, task) = self.transport_kind.connect(
            self.endpoint.clone(), self.encoding_kind
        ).await?;

        {
            let mut my_driver = self.driver.lock().await;
            *my_driver = Some(driver);
        }

        let mut task_end_reason = task.map(|res| {
            match res {
                Ok(a) => a,
                Err(_) => DriverStopReason::TaskError
            }
        });

        // spawn listener for rpcs
        let handle = self.clone();
        tokio::spawn(async move {
            loop {
                tokio::select! {
                    msg = recver.recv() => {
                        // If the sender is dropped, break the loop
                        let Some(msg) = msg else {
                            break;
                        };

                        handle.on_message(msg).await;
                    },
                    reason = &mut task_end_reason => {
                        handle.on_close(reason).await;
                    }
                }
            }
        });

        Ok(())
    }

    pub(crate) async fn connect(self: &Arc<Self>) -> Result<()> {
        self.connect_inner().await?;
        Ok(())
    }

    async fn on_open(self: &Arc<Self>, init: &protocol::Init) {
        println!("Connected to server: {:?}", init);


        for (event_name, _) in self.event_subscriptions.lock().await.iter() {
            self.send_subscription(event_name.clone(), true).await;
        }

        // Flush message queue
        {
            let mut msg_queue = self.msg_queue.lock().await;
            for msg in msg_queue.drain(..) {
                // If its in the queue, it isn't ephemeral, so we pass
                // default SendMsgOpts 
                self.send_msg(msg, SendMsgOpts::default()).await;
            }
        }
    }

    async fn on_close(self: &Arc<Self>, reason: DriverStopReason) {
        println!("Connection closed: {:?}", reason);
        
        {
            let mut d_guard = self.driver.lock().await;
            let Some(d) = d_guard.take() else {
                // We destroyed the driver already,
                // e.g. .disconnect() was called
                return;
            };

            d.hard_terminate();
        }

    }

    async fn on_message(self: &Arc<Self>, msg: Arc<protocol::ToClient>) {
        let body = &msg.b;

        match body {
            protocol::ToClientBody::Init { i: init } => {
                self.on_open(init).await;
            },
            protocol::ToClientBody::ResponseOk { ro } => {
                let id = ro.i;
                let mut in_flight_rpcs = self.in_flight_rpcs.lock().await;
                let Some(tx) = in_flight_rpcs.remove(&id) else {
                    println!("Unexpected response: rpc id not found");
                    return;
                };
                if let Err(e) = tx.send(Ok(ro.clone())) {
                    eprintln!("{:?}", e);
                    return;
                }
            }, 
            protocol::ToClientBody::ResponseError { re } => {
                let id = re.i;
                let mut in_flight_rpcs = self.in_flight_rpcs.lock().await;
                let Some(tx) = in_flight_rpcs.remove(&id) else {
                    println!("Unexpected response: rpc id not found");
                    return;
                };
                if let Err(e) = tx.send(Err(re.clone())) {
                    eprintln!("{:?}", e);
                    return;
                }
            },
            protocol::ToClientBody::EventMessage { ev } => {
                let listeners = self.event_subscriptions.lock().await;
                if let Some(callbacks) = listeners.get(&ev.n) {
                    for cb in callbacks {
                        cb(&ev.a);
                    }
                }
            },
            protocol::ToClientBody::EventError { er } => {
                eprintln!("Event error: {:?}", er);
            },
            _ => {}
        }
    }

    async fn send_msg(self: &Arc<Self>, msg: Arc<protocol::ToServer>, opts: SendMsgOpts) {
        let guard = self.driver.lock().await;

        'send_immediately: {
            let Some(driver) = guard.deref() else {
                break 'send_immediately;
            };

            let Ok(_) = driver.send(msg.clone()).await else {
                break 'send_immediately;
            };

            return;
        }
        
        // Otherwise queue
        if opts.ephemeral == false {
            self.msg_queue.lock()
                .await
                .push(msg.clone());
        }

        return;
    }

    pub async fn rpc(self: &Arc<Self>, method: &str, params: Vec<Value>) -> Result<Value> {
        let id: i64 = self.rpc_counter
            .fetch_add(1, Ordering::SeqCst);

        let (tx, rx) = oneshot::channel();
        self.in_flight_rpcs.lock().await.insert(id, tx);

        self.send_msg(Arc::new(protocol::ToServer {
            b: protocol::ToServerBody::RpcRequest {
                rr: protocol::RpcRequest {
                    i: id,
                    n: method.to_string(),
                    a: params,
                }
            }
        }), SendMsgOpts::default()).await;

        // TODO: Support reconnection
        let Ok(res) = rx.await else {
            // Verbosity
            return Err(anyhow::anyhow!("Socket closed during rpc"));
        };

        match res {
            Ok(ok) => Ok(ok.o),
            Err(err) => {
                let metadata = err.md.unwrap_or(json!(null));
                
                Err(anyhow::anyhow!(
                    "RPC Error({}): {:?}, {:#}", 
                    err.c, err.m, metadata
                ))
            }
        }
    }

    async fn send_subscription(self: &Arc<Self>, event_name: String, subscribe: bool) {
        self.send_msg(Arc::new(protocol::ToServer {
            b: protocol::ToServerBody::SubscriptionRequest {
                sr: protocol::SubscriptionRequest {
                    e: event_name,
                    s: subscribe
                }
            }
        }), SendMsgOpts { ephemeral: true }).await;
    }

    async fn add_event_subscription(self: &Arc<Self>, event_name: String, callback: Box<EventCallback>) {
        // TODO: Support for once
        let mut listeners = self.event_subscriptions.lock().await;

        let is_new_subscription = listeners.contains_key(&event_name) == false;

        listeners
            .entry(event_name.clone())
            .or_insert(Vec::new())
            .push(callback);

        if is_new_subscription {
            self.send_subscription(event_name, true).await;
        }
    }

    pub async fn on_event<F>(self: &Arc<Self>, event_name: &str, callback: F)
    where
        F: Fn(&Vec<Value>) + Send + Sync + 'static
    {
        self.add_event_subscription(
            event_name.to_string(),
            Box::new(callback)
        ).await
    }

    pub async fn disconnect(self: &Arc<Self>) {
        let mut d_guard = self.driver.lock().await;
        if let Some(mut d) = d_guard.take() {
            d.disconnect().ok();
        }
        self.in_flight_rpcs.lock().await.clear();
        self.event_subscriptions.lock().await.clear();
    }
}


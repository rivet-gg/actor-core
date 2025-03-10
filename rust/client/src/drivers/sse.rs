use std::sync::Arc;
use std::time::Duration;
use eventsource_client::{Client, ClientBuilder, ReconnectOptions, SSE};
use futures_util::StreamExt;
use reqwest::Response;
use tokio::sync::{mpsc, oneshot};
use anyhow::{Context, Error, Result};
use base64::prelude::*;
use tokio::task::JoinHandle;

use crate::encoding::EncodingKind;
use crate::protocol::{ToClient, ToServer, ToClientBody};

use super::{DriverHandle, DriverStopReason, MessageToClient, MessageToServer};

#[derive(Debug, Clone, PartialEq, Eq)]
struct ConnectionDetails {
    id: String,
    token: String,
}

#[derive(PartialEq, Eq)]
enum ConnectionState {
    Opened(ConnectionDetails),
    Closed(),
}

pub(crate) async fn connect(endpoint: String, encoding_kind: EncodingKind) -> Result<(
    DriverHandle,
    mpsc::Receiver<MessageToClient>,
    JoinHandle<DriverStopReason>
)> {
    let url = build_conn_url(&endpoint, encoding_kind);

    let client = ClientBuilder::for_url(&url)?
        .build();

    let (in_tx, in_rx) = mpsc::channel::<MessageToClient>(32);
    let (out_tx, out_rx) = mpsc::channel::<MessageToServer>(32);
    let (dc_tx, dc_rx) = oneshot::channel::<()>();

    let task = tokio::spawn(start(
        client,
        endpoint,
        encoding_kind,
        in_tx,
        out_rx,
        dc_rx
    ));

    let handle = DriverHandle::new(dc_tx, out_tx, task.abort_handle().clone());
    Ok((handle, in_rx, task))
}

async fn start(
    client: impl Client,
    endpoint: String,
    encoding_kind: EncodingKind,
    in_tx: mpsc::Sender<MessageToClient>,
    mut out_rx: mpsc::Receiver<MessageToServer>,
    mut dc_rx: oneshot::Receiver<()>
) -> DriverStopReason {
    let serialize = get_serializer(encoding_kind);
    let deserialize = get_deserializer(encoding_kind);

    let conn = match do_handshake(&client, &deserialize, &in_tx, &mut dc_rx).await {
        Ok(conn) => conn,
        Err(reason) => {
            eprintln!("Failed to connect: {:?}", reason);
            return reason;
        }
    };

    let mut stream = client.stream();

    loop {
        tokio::select! {
            _ = &mut dc_rx => return DriverStopReason::UserAborted,
            msg = out_rx.recv() => {
                let Some(msg) = msg else {
                    return DriverStopReason::UserAborted;
                };

                let msg = match serialize(&msg) {
                    Ok(msg) => msg,
                    Err(e) => {
                        eprintln!("Failed to serialize {:?} {:?}", msg, e);
                        continue;
                    }
                };

                // Add connection ID and token to the request URL
                let request_url = format!(
                    "{}/connections/{}/message?encoding={}&connectionToken={}", 
                    endpoint, conn.id, encoding_kind.as_str(), urlencoding::encode(&conn.token)
                );
            
                // Handle response
                let resp = reqwest::Client::new()
                    .post(request_url)
                    .body(msg)
                    .send()
                    .await;

                println!("Response: {:?}", resp);
            },
            // Handle sse incoming
            msg = stream.next() => {
                let Some(msg) = msg else {
                    println!("Receiver dropped");
                    return DriverStopReason::ServerDisconnect;
                };

                match msg {
                    Ok(msg) => match msg {
                        SSE::Comment(comment) => eprintln!("Comment: {}", comment),
                        SSE::Connected(_) => eprintln!("warning: received sse connection past-handshake"),
                        SSE::Event(event) => {
                            let msg = match deserialize(&event.data) {
                                Ok(msg) => msg,
                                Err(e) => {
                                    eprintln!("Failed to deserialize {:?} {:?}", event, e);
                                    continue;
                                }
                            };

                            if let Err(e) = in_tx.send(Arc::new(msg)).await {
                                eprintln!("Receiver in_rx dropped {:?}", e);
                                return DriverStopReason::UserAborted;
                            }
                        },
                    }
                    Err(e) => {
                        eprintln!("Sse error: {}", e);
                        return DriverStopReason::ServerError;
                    }
                }
            }
        }
    }
}

async fn do_handshake(
    client: &impl Client,
    deserialize: &impl Fn(&str) -> Result<ToClient>,
    in_tx: &mpsc::Sender<MessageToClient>,
    mut dc_rx: &mut oneshot::Receiver<()>
) -> Result<ConnectionDetails, DriverStopReason> {
    let mut stream = client.stream();

    loop {
        tokio::select! {
            msg = &mut dc_rx => {
                // Doesn't matter if its a dropped sender or
                // a specific dc message atm.
                let _ = msg;
                return Err(DriverStopReason::UserAborted);
            },
            // Handle sse incoming
            msg = stream.next() => {
                let Some(msg) = msg else {
                    println!("Receiver dropped");
                    return Err(DriverStopReason::ServerDisconnect);
                };

                match msg {
                    Ok(msg) => match msg {
                        SSE::Comment(comment) => eprintln!("Comment: {}", comment),
                        SSE::Connected(_) => eprintln!("Connected Sse"),
                        SSE::Event(event) => {
                            let msg = match deserialize(&event.data) {
                                Ok(msg) => msg,
                                Err(e) => {
                                    eprintln!("Failed to deserialize {:?} {:?}", event, e);
                                    continue;
                                }
                            };

                            let msg = Arc::new(msg);

                            if let Err(e) = in_tx.send(msg.clone()).await {
                                eprintln!("Receiver in_rx dropped {:?}", e);
                                return Err(DriverStopReason::UserAborted);
                            }

                            // Wait until we get an Init packet
                            let ToClientBody::Init { i } = &msg.b else {
                                continue;
                            };

                            // Mark handshake complete
                            let conn_id = &i.ci;
                            let conn_token = &i.ct;

                            return Ok(ConnectionDetails {
                                id: conn_id.clone(),
                                token: conn_token.clone()
                            })
                        },
                    }
                    Err(e) => {
                        eprintln!("Sse error: {}", e);
                        return Err(DriverStopReason::ServerError);
                    }
                }
            }
        }
    }
}


fn build_conn_url(endpoint: &str, encoding_kind: EncodingKind) -> String {
    format!("{}/connect/sse?encoding={}", endpoint, encoding_kind.as_str())
}

fn get_serializer(encoding_kind: EncodingKind) -> impl Fn(&ToServer) -> Result<Vec<u8>> {
    encoding_kind.get_default_serializer()
}

fn get_deserializer(encoding_kind: EncodingKind) -> impl Fn(&str) -> Result<ToClient> {
    match encoding_kind {
        EncodingKind::Json => json_deserialize,
        EncodingKind::Cbor => cbor_deserialize
    }
}

fn json_deserialize(value: &str) -> Result<ToClient> {
    let msg = serde_json::from_str::<ToClient>(value)?;

    Ok(msg)
}

fn cbor_deserialize(msg: &str) -> Result<ToClient> {
    let msg = BASE64_STANDARD.decode(msg.as_bytes()).context("base64 failure:")?;
    let msg = serde_cbor::from_slice::<ToClient>(&msg).context("serde failure:")?;

    Ok(msg)
}

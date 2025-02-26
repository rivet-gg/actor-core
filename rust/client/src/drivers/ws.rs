use std::fmt::Debug;
use futures_util::{Sink, SinkExt, StreamExt};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::{Bytes,Message,Utf8Bytes, Error};
use anyhow::{Result, Context};


pub struct WebSocketSender {
    pub tx: mpsc::Sender<Message>,
}

// TODO: Maybe turn this into a Sink
impl WebSocketSender {
    pub async fn send_raw(&self, buf: &[u8]) -> Result<()> {
        let msg = Bytes::from(Vec::from(buf));
        let msg = Message::Text(Utf8Bytes::try_from(msg)?);

        self.tx.send(msg)
            .await
            .context("Failed to send message")?;

        Ok(())
    }
}

pub struct WebSocketReceiver {
    pub rx: mpsc::Receiver<Bytes>,
}

// TODO: Maybe turn this into a StreamExt
impl WebSocketReceiver {
    pub async fn recv_msg(&mut self) -> Result<Option<Bytes>> {
        Ok(self.rx.recv().await)
    }
}

pub struct WebSocketDriver {
    endpoint: String,
}

impl WebSocketDriver {
    pub fn new(endpoint: String) -> Self {
        WebSocketDriver {
            endpoint
        }
    }

    pub async fn connect(
        &self
    ) -> Result<(WebSocketSender, WebSocketReceiver)> {
        let url = build_conn_url(&self.endpoint);
        println!("url: {}", url);
        let (ws, _res) = tokio_tungstenite::connect_async(url)
            .await
            .context("Failed to connect to WebSocket")?;
        let (ws_sink, ws_stream) = ws.split(); 

        let sender = self.create_sender(ws_sink);
        let receiver = self.create_receiver(ws_stream);

        Ok((sender, receiver))
    }

    fn create_sender<S>(&self, mut ws_sink: S) -> WebSocketSender
    where
        S: Sink<Message, Error: Debug> + Unpin + Send + 'static
    {
        let (out_tx, mut out_rx) = mpsc::channel::<Message>(32);
        tokio::spawn(async move {
            while let Some(msg) = out_rx.recv().await {
                if let Err(e) = ws_sink.send(msg).await {
                    eprintln!("Failed to send message: {:?}", e);
                    break;
                }
            }
        });

        WebSocketSender {
            tx: out_tx
        }
    }

    fn create_receiver<S>(&self, mut ws_stream: S) -> WebSocketReceiver
    where
        S: StreamExt<Item = Result<Message, Error>> + Unpin + Send + 'static
    {
        let (in_tx, in_rx) = mpsc::channel::<Bytes>(32);
        tokio::spawn(async move {
            while let Some(msg) = ws_stream.next().await {
                match msg {
                    Ok(Message::Text(text)) => {
                        let bytes = Bytes::from(text);
                        if let Err(e) = in_tx.send(bytes).await {
                            eprintln!("Failed to send text message: {}", e);
                            break;
                        }
                    },
                    Ok(Message::Binary(bin)) => {
                        let bytes = Bytes::from(bin);
                        if let Err(e) = in_tx.send(bytes).await {
                            eprintln!("Failed to send binary message: {}", e);
                            break;
                        }
                    },
                    Ok(Message::Close(close)) => {
                        println!("Closed: {:?}", close);
                        break;
                    },
                    Ok(_) => {
                        println!("Other message type received");
                    },
                    Err(e) => {
                        eprintln!("WebSocket error: {}", e);
                        break;
                    }
                }
            }
        });

        WebSocketReceiver {
            rx: in_rx
        }
    }
}

fn build_conn_url(endpoint: &String) -> String {
    let url = format!("{}/connect/{}?encoding={}", endpoint, "websocket", "json");
    // let url = format!("{}/connect?format={}", endpoint, "json");

    // let Some(params) = self.parameters else {
    return url;
    // };

    // let params_str = serde_json::to_string(&params).unwrap();
    // if params_str.len() > MAX_CONN_PARAMS_SIZE {
    //     panic!("Connection parameters too long");
    // }

    // let encoded_params = urlencoding::encode(&params_str);

    // format!("{}&params={}", url, encoded_params)
}
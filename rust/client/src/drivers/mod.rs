use std::sync::Arc;

use anyhow::Result;
use tokio::{sync::{mpsc, oneshot}, task::{AbortHandle, JoinHandle}};
use crate::{encoding::EncodingKind, protocol};

pub mod ws;
pub mod sse;

#[derive(Debug, Clone, Copy)]
pub enum DriverStopReason {
    UserAborted,
    ServerDisconnect,
    ServerError,
    TaskError,
}

pub(crate) type MessageToClient = Arc<protocol::ToClient>;
pub(crate) type MessageToServer = Arc<protocol::ToServer>;

pub(crate) struct DriverHandle {
    dc_tx: Option<oneshot::Sender<()>>,
    abort_handle: AbortHandle,
    sender: mpsc::Sender<MessageToServer>,
}

impl DriverHandle {
    pub fn new(
        dc_tx: oneshot::Sender<()>,
        sender: mpsc::Sender<MessageToServer>,
        abort_handle: AbortHandle
    ) -> Self {
        Self {
            dc_tx: Some(dc_tx),
            sender,
            abort_handle,
        }
    }

    pub async fn send(&self, msg: Arc<protocol::ToServer>) -> Result<()> {
        self.sender.send(msg).await?;

        Ok(())
    }

    pub fn hard_terminate(&self) {
        self.abort_handle.abort();
    }

    pub fn disconnect(&mut self) -> Result<()> {
        let Some(dc_tx) = self.dc_tx.take() else {
            return Err(anyhow::anyhow!("Attempted to call .disconnect() twice"));
        };

        let Ok(_) = dc_tx.send(()) else {
            return Err(anyhow::anyhow!("Failed to oneshot disconnect msg: receiver already closed"));
        };

        return Ok(())
    }
}

impl Drop for DriverHandle {
    fn drop(&mut self) {
        self.disconnect().ok();

        self.hard_terminate()
    }
}

#[derive(Debug, Clone, Copy)]
pub enum TransportKind {
    WebSocket,
    Sse,
}

impl TransportKind {
    pub(crate) async fn connect(
        &self,
        endpoint: String,
        encoding_kind: EncodingKind
    ) -> Result<(
        DriverHandle,
        mpsc::Receiver<MessageToClient>,
        JoinHandle<DriverStopReason>
    )> {
        match *self {
            TransportKind::WebSocket => ws::connect(endpoint, encoding_kind).await,
            TransportKind::Sse => sse::connect(endpoint, encoding_kind).await
        }
    }
}
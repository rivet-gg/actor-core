use anyhow::Result;
use serde_json::{json, Value};
use url::Url;

use crate::handle::{ActorHandle, ActorHandleInner};

pub struct Client {
    manager_endpoint: String,
    // encoding_kind
    // transport_kind
}

impl Client {
    pub fn new(
        manager_endpoint: String,
    ) -> Self {
        Self {
            manager_endpoint,
        }
    }

    async fn post_manager_endpoint(&self, path: &str, body: Value) -> Result<Value> {
        let client = reqwest::Client::new();
        let req = client.post(
            format!("{}{}", self.manager_endpoint, path)
        );
        let req = req.header("Content-Type", "application/json");
        let req = req.body(
            serde_json::to_string(&body)?
        );
        let res = req.send().await?;
        let body = res.text().await?;
        
        let body: Value = serde_json::from_str(&body)?;

        Ok(body)
    }

    #[allow(dead_code)]
    async fn get_manager_endpoint(&self, path: &str) -> Result<Value> {
        let client = reqwest::Client::new();
        let req = client.get(
            format!("{}{}", self.manager_endpoint, path)
        );
        let res = req.send().await?;
        let body = res.text().await?;
        let body: Value = serde_json::from_str(&body)?;

        Ok(body)
    }

    pub async fn get(&self, tags: Vec<(String, String)>) -> Result<ActorHandle> {
        // TODO: opts
        // TODO: Make sure `name` tag is present
        let mut tag_map = serde_json::Map::new();
    
        for (key, value) in tags {
            tag_map.insert(key, Value::String(value));
        }

        let body = json!({
            "query": {
                "getOrCreateForTags": {
                    "tags": tag_map,
                    "create": {
                        "tags": tag_map
                    }
                }
            },
        });
        let res_json = self.post_manager_endpoint("/manager/actors", body).await?;
        let Some(endpoint) = res_json["endpoint"].as_str() else {
            return Err(anyhow::anyhow!("No endpoint returned. Request failed? {:?}", res_json));
        };

        let handle = ActorHandleInner::new(
            replace_http_with_ws(endpoint)?
        );
        handle.connect().await?;

        Ok(handle)
    }
}

fn replace_http_with_ws(url_str: &str) -> Result<String, anyhow::Error> {
    let mut url = Url::parse(url_str)?;
    if url.scheme() == "http" {
        if url.set_scheme("ws").is_err() {
            return Err(anyhow::anyhow!("Failed to set scheme to ws"));
        }
    } else if url.scheme() == "https" {
        if url.set_scheme("wss").is_err() {
            return Err(anyhow::anyhow!("Failed to set scheme to wss"));
        }
    } else {
        return Err(anyhow::anyhow!("Invalid scheme: {:?}", url.scheme()));
    }
    Ok(url.to_string())
}
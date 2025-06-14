# ActorCore Python Client

_The Python client for ActorCore, the Stateful Serverless Framework_

Use this client to connect to ActorCore services from Python applications.

## Resources

- [Quickstart](https://actorcore.org/introduction)
- [Documentation](https://actorcore.org/clients/python)
- [Examples](https://github.com/rivet-gg/actor-core/tree/main/examples)

## Getting Started

### Step 1: Installation

```bash
pip install python-actor-core-client
```

### Step 2: Connect to Actor

```python
from python_actor_core_client import AsyncClient as ActorClient
import asyncio

async def main():
    # Create a client connected to your ActorCore manager
    client = ActorClient("http://localhost:6420")

    # Connect to a chat room actor
    chat_room = await client.get("chat-room", tags=[("room", "general")])

    # Listen for new messages
    chat_room.on_event("newMessage", lambda msg: print(f"New message: {msg}"))

    # Send message to room
    await chat_room.action("sendMessage", ["alice", "Hello, World!"])

    # When finished
    await chat_room.disconnect()

if __name__ == "__main__":
    asyncio.run(main())
```

### Features

- Async-first design with `AsyncClient`
- Event subscription support via `on_event`
- Action invocation with JSON-serializable arguments
- Simple event handling with `receive` method
- Clean disconnection handling via `disconnect`

## Community & Support

- Join our [Discord](https://rivet.gg/discord)
- Follow us on [X](https://x.com/rivet_gg)
- Follow us on [Bluesky](https://bsky.app/profile/rivet.gg)
- File bug reports in [GitHub Issues](https://github.com/rivet-gg/actor-core/issues)
- Post questions & ideas in [GitHub Discussions](https://github.com/rivet-gg/actor-core/discussions)

## License

Apache 2.0

# Cursor Example

A real-time collaborative cursor demo built with ActorCore and Next.js. This example demonstrates how to create a multi-user application where users can see each other's cursor positions in real-time.

## Features

- Real-time cursor position tracking across multiple browser tabs/windows
- Each user has a unique random ID, username, and color
- Cursor list showing all connected users with their coordinates
- Visual cursor pointers showing live cursor positions
- Efficient cursor movement with lodash-es throttling (16ms)
- Automatic cleanup when users disconnect
- Built with React, Next.js, and Tailwind CSS
- Uses the new ActorCore React framework for seamless integration

## Getting Started

1. Install dependencies:
```bash
yarn install
```

2. Start both the development servers:
```bash
yarn dev
```

This will start:
- ActorCore server on port 6420
- Next.js development server on port 3000

3. Open multiple browser tabs/windows to `http://localhost:3000` to see the cursors interact

## How It Works

The application uses ActorCore's real-time communication features with the new React framework to:

1. Create a unique cursor for each connected client with a random color and username
2. Broadcast throttled cursor position updates (every 16ms) using lodash-es
3. Maintain a list of all active cursors with their positions
4. Remove cursors when clients disconnect

### Key Components

- `src/cursor-room.ts`: The ActorCore room that manages cursor state and communication
- `src/components/App.tsx`: Main application component using ActorCore React hooks
- `src/components/CursorList.tsx`: React component that displays the list of connected cursors
- `src/components/CursorPointers.tsx`: React component that renders the visual cursor indicators
- `src/server.ts`: ActorCore server setup
- `src/index.ts`: ActorCore React client setup

## Architecture

The application follows a client-server architecture where:

1. The ActorCore server maintains the source of truth for cursor states
2. The React client uses ActorCore hooks (`useActor` and `useActorEvent`) to manage state and events
3. Clients send cursor position updates when their mouse moves (throttled with lodash-es)
4. The server broadcasts these updates to all other connected clients
5. Each client renders both the cursor list and visual cursor pointers
6. The UI is built with Next.js and styled with Tailwind CSS with a modern dark theme

## React Framework Integration

This example showcases the new ActorCore React framework features:

```typescript
// Create the ActorCore React client
const client = createClient<App>("http://localhost:6420");
export const actorCore = createReactActorCore(client);

// Use ActorCore hooks in components
const [actorState] = actorCore.useActor("cursorRoom");

// Handle actor events
actorCore.useActorEvent(
  { actor: actorState.actor, event: "cursorMoved" },
  (event) => {
    // Handle cursor updates
  }
);
```

## Development

To modify the example:

1. Edit `src/cursor-room.ts` to change cursor behavior or add new features
2. Modify React components in `src/components/` to update the UI
3. The server runs on port 6420 by default
4. The client uses Next.js on port 3000

## Dependencies

Key dependencies include:
- `actor-core`: For real-time state management
- `@actor-core/react`: For React framework integration
- `next`: For the React framework and development server
- `lodash-es`: For efficient cursor movement throttling
- `tailwindcss`: For styling

## License

This example is part of the ActorCore project and is available under the Apache 2.0 license. 
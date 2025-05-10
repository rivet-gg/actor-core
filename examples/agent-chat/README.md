# Agent Sync Chat

A modern real-time chat application with AI integration, built using ActorCore, TypeScript, and Next.js.

## Features

- Real-time messaging using ActorCore's actor model
- Claude AI integration for intelligent chat assistance
- Multiple chat rooms with isolated actor states
- Real-time user presence and typing indicators
- Modern, responsive UI with Tailwind CSS
- Persistent message storage using ActorCore's state management
- Fast and efficient message delivery through WebSocket
- Mobile-friendly design with animations

## Architecture

The application uses ActorCore's actor model for real-time communication:

- Each chat room is an isolated actor instance
- Messages are broadcasted using ActorCore's event system
- User state is managed through actor connections
- Claude AI integration runs in a separate service
- Frontend uses React with Next.js for optimal performance

## Technologies

- [ActorCore](https://github.com/rivet-gg/actorcore) - Actor model framework for real-time applications
- [TypeScript](https://www.typescriptlang.org/) - Type-safe JavaScript
- [Next.js](https://nextjs.org/) - React framework for production
- [Anthropic Claude API](https://www.anthropic.com/claude) - AI language model
- [Tailwind CSS](https://tailwindcss.com/) - Utility-first CSS framework

## Prerequisites

- Node.js 18+ and yarn
- Anthropic API key for Claude integration

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/agentsyncchat.git
cd agentsyncchat
```

2. Install dependencies:
```bash
# Install root dependencies
yarn install

# Install frontend dependencies
cd frontend && yarn install
```

3. Configure environment variables:

Create a `.env` file in the root directory:
```env
PORT=3000
ANTHROPIC_API_KEY=your_api_key_here
```

Create a `.env.local` file in the `frontend` directory:
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

4. Start the development servers:

```bash
# Start the backend server
yarn dev

# In a new terminal, start the frontend
cd frontend && yarn dev
```

The application will be available at:
- Frontend: http://localhost:3001
- Backend: http://localhost:3000

## Project Structure

```
├── src/                    # Backend source code
│   ├── index.ts           # Main entry point and server setup
│   ├── chat-room.ts       # Chat room actor implementation
│   ├── claude-service.ts  # Claude AI integration service
│   ├── client.ts         # ActorCore client configuration
│   └── web-server-actor.ts# Web server actor implementation
│
├── frontend/              # Frontend application
│   ├── app/              # Next.js app directory
│   │   └── page.tsx      # Main chat interface
│   ├── public/           # Static assets
│   └── package.json      # Frontend dependencies
│
└── package.json          # Backend dependencies
```

## Actor Implementation

The chat system uses ActorCore's actor model:

- Each chat room is an isolated actor instance
- Messages are handled through RPC calls
- State is automatically persisted between calls
- Events are used for real-time updates
- Typing indicators use ActorCore's event system

## Development

- Use `yarn check-types` to verify TypeScript types
- The frontend auto-reloads when you make changes
- The backend uses `tsx watch` for automatic reloading
- Follow ActorCore's development guide for best practices

## Troubleshooting

Common issues and solutions:

1. Port conflicts:
```bash
# Check for processes using ports
lsof -i :3000,3001

# Kill the processes if needed
kill -9 <PID>
```

2. TypeScript errors:
```bash
# Run type checking
yarn check-types

# Clean and rebuild
yarn clean && yarn build
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Follow ActorCore development guidelines
4. Run tests and type checks
5. Commit your changes (`git commit -m 'Add feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## License

MIT

## Security

- Never commit API keys or sensitive data
- Use environment variables for configuration
- Follow ActorCore's security guidelines
- Validate all user inputs
- Use appropriate CORS settings 
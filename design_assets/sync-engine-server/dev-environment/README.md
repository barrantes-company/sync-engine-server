# Development Environment Overview

This project is designed to configure a comprehensive development environment that includes various agents, tools, servers, and essential plugins. Below is an overview of the project's structure and components.

## Project Structure

- **.github/**: Contains configuration files for agents and instructions for AI coding agents.
  - **agents/**: Configuration files for various agents used in the development environment.
  - **copilot-instructions.md**: Instructions for AI coding agents on how to interact with the codebase.

- **.vscode/**: Contains settings and extensions for the development environment.
  - **extensions.json**: Recommended extensions for the development environment.
  - **settings.json**: Workspace-specific settings, including formatting options and linting rules.

- **agents/**: Directory for storing agent-specific configurations and scripts.

- **plugins/**: Directory for essential plugins that enhance functionality, such as Dotenv Environment Loader and Socket.IO.

- **servers/**: Contains configuration files for servers.
  - **mcp.json**: Configuration for Model Context Protocol Servers, detailing settings for GCP Pub/Sub & Storage MCP and Git/GitHub Context MCP.

- **tools/**: Directory for basic tools and skills that facilitate development tasks.

- **AGENTS.md**: Comprehensive guide for the agents configured in the environment, outlining their roles, capabilities, and usage instructions.

## Setup Instructions

1. Clone the repository to your local machine.
2. Navigate to the `dev-environment` directory.
3. Install the recommended extensions listed in `.vscode/extensions.json`.
4. Configure your workspace settings as specified in `.vscode/settings.json`.
5. Review the agent configurations in the `.github/agents` directory and customize as needed.
6. Set up the necessary plugins located in the `plugins` directory.
7. Ensure the server configurations in `servers/mcp.json` are correctly set up for your environment.

## Usage Guidelines

- Follow the instructions in `AGENTS.md` for utilizing the configured agents effectively.
- Refer to the `.github/copilot-instructions.md` for guidance on how AI coding agents can interact with the codebase.
- Use the tools and plugins in their respective directories to enhance your development workflow.

This README serves as a starting point for understanding and utilizing the development environment effectively. For further details, please refer to the specific files and directories mentioned above.
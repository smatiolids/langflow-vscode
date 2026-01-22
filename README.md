# Langflow VS Code Plugin

Browse Langflow projects and flows, inspect flow components, and edit component Python code directly from VS Code.

<img width="1234" height="980" alt="Screenshot 2026-01-21 at 23 47 24" src="https://github.com/user-attachments/assets/98e1cc1b-5436-478d-a81c-ebad3aa33473" />


## Usage

### Setup

1. Open the Langflow view container in the Activity Bar.
2. In the "Connection" view, set:
   - Base URL (ex: `http://localhost:3000`)
   - API key
   - Optional: Langflow venv path (used for Python syntax checks)
3. If you prefer Settings, configure:
   - `Langflow: Base Url`
   - `Langflow: Venv Path`

### Browse and edit flows

ATTENTION: Before editing a component code, close it on the Langflow UI.

1. Expand "Projects & Flows" and pick a project.
2. Select a flow to load its components.
3. Click a component to open its Python code in a temp file.
4. Save the file to push changes back to Langflow.

### Edit component properties

1. Select a component in the tree.
2. Use the "Properties" view to edit fields.
3. Save to update the flow definition in Langflow.

### Run a flow

1. Select a flow in the tree.
2. Use the "Run Flow" view to enter input values.
3. Click Run and check the "Langflow Run" output channel for results.

### Open flow JSON

- Use "Langflow: Open Flow JSON" from the tree context menu to open the full flow definition.
- Save the JSON file to update the flow in Langflow.

### Commands

- `Langflow: Connect` - prompt for API key and refresh data
- `Langflow: Set API Key` - update the stored API key
- `Langflow: Refresh` - reload projects and flows
- `Langflow: Open Flow JSON` - open the selected flow definition

## Testing locally

1. Run `npm install`.
2. Run `npm run compile`.
3. Open this folder in VS Code and press `F5` to launch the Extension Development Host.
4. In the Dev Host:
   - Run `Langflow: Connect` and enter your API key.
   - Set `langflow.baseUrl` in Settings if needed.
   - Expand the "Projects & Flows" view, select a project and expand a flow.
   - Click a component under the flow to open code.
   - Edit and save to push updates back to Langflow.

Notes:
- You need a reachable Langflow instance and a valid API key.
- There are no automated tests yet; this is manual validation via the Dev Host.

## Publishing

See `PUBLISHING.md` for the release checklist and Marketplace steps.

## Notes

- The extension uses Langflow DevOps API endpoints (`/api/v1/...`).
- If your Langflow instance uses different endpoints, adjust the client in `src/langflowClient.ts`.

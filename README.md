# RFC Library

A lightweight web application for managing and organizing Google Docs. Import documents, add tags, search, filter, and preview — all in one place.

## Features

- Import Google Docs by URL
- Organize documents with custom titles and tags
- Search and filter by title or tags
- Embedded document preview
- Export and import library data as JSON

## Tech Stack

- **Backend:** Node.js, Express.js
- **Database:** SQLite via `better-sqlite3`
- **Frontend:** Vanilla JavaScript, HTML5, CSS3

## Getting Started

### Prerequisites

- Node.js (ES2020+ / ES Modules support required)

### Installation

```bash
npm install
```

### Running

```bash
# Production
npm start

# Development (with hot reload)
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Usage

1. Paste a Google Docs URL into the sidebar input and press **Add**
2. The document is saved with its title and author metadata
3. Add tags to organize documents
4. Use the search bar to filter by title, author, or tag
5. Click a document to preview it in the main panel

### Export / Import

- **Export:** Downloads the full library as a timestamped JSON file
- **Import:** Loads a previously exported JSON file, merging with existing data

## Project Structure

```
rfc-library/
├── public/
│   ├── index.html    # App shell
│   ├── app.js        # Client-side logic
│   └── style.css     # Styles
├── server.js         # Express server + REST API
├── package.json
└── library.db        # SQLite database (auto-created on first run)
```

## API

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/docs` | Add a document by Google Docs URL |
| `GET` | `/api/docs` | List all documents with tags |
| `PATCH` | `/api/docs/:id/title` | Update document title |
| `PATCH` | `/api/docs/:id/tags` | Update document tags |
| `POST` | `/api/docs/import` | Bulk import from JSON |
| `DELETE` | `/api/docs/:id` | Delete a document |

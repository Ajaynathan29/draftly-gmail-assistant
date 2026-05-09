# 🚀 Draftly: AI-Powered Gmail Assistant

Draftly is a backend REST API built with Node.js, Express, and PostgreSQL that automates email replies using the Gmail API and Google's Gemini AI. It fetches unread emails, generates context-aware drafts, and holds them securely in a database for human approval via a custom Chrome Extension before sending.

## ✨ Features
* **OAuth2 Authentication:** Secure connection to the Gmail API.
* **Context-Aware AI:** Uses Gemini AI to read incoming emails and draft highly accurate, professional replies.
* **Database State Management:** Drafts are stored in PostgreSQL with a `Pending Approval` status.
### 🐳 Docker Support
This repository includes a `Dockerfile` for easy containerization. If you prefer not to run the Node server locally, you can build and run the entire backend securely inside an isolated Docker container. 
* **Human-in-the-Loop:** Emails are *never* sent automatically. A user must trigger the `PUT /drafts/:id` route to approve the text.
* **Custom Chrome Extension UI:** A sleek frontend built to interact with the backend directly from the browser.

## 🛠️ Tech Stack
* **Backend:** Node.js, Express.js
* **Database:** PostgreSQL (using `pg` pool)
* **AI Integration:** Google Generative AI (Gemini Flash)
* **APIs:** Gmail API (googleapis)
* **Testing:** Jest, Supertest

## 🚀 How to Run Locally

### 1. Prerequisites
* Node.js installed
* A PostgreSQL database running
* A Google Cloud Console project with Gmail API enabled (and `credentials.json` downloaded)
* Gemini API Key

### 2. Environment Setup
Create a `.env` file in the root directory:
```env
PORT=3000
DATABASE_URL=your_postgres_connection_string
GEMINI_API_KEY=your_gemini_api_key
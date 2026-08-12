# Frontend Integration Guide: Technipie Chatbot API

This document is intended for the frontend coding agent to understand how to interact with the Technipie Chatbot REST API. 

## Base URL
By default, the backend runs locally on `http://localhost:3000`. 
All API routes are prefixed with `/api/`.

---

## Endpoint: Chat
**POST** `/api/chat`

This is the primary endpoint for sending a user message to the AI and receiving a response.

### 1. Request Format
- **Content-Type**: `application/json`
- **Body**: 
  ```json
  {
    "question": "Your message here"
  }
  ```

### 2. Session Management (CRITICAL)
The backend uses **HttpOnly Cookies** to manage conversation memory (sessions). For the chatbot to remember the context of the conversation, the frontend **MUST** include credentials in its requests.

When using `fetch` or `axios`, you must explicitly allow cookies:
- **Fetch API**: Add `credentials: 'include'`
  ```javascript
  fetch('http://localhost:3000/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include', // <--- CRITICAL for sessions
    body: JSON.stringify({ question: "Hello" })
  });
  ```
- **Axios**: Add `withCredentials: true`

*Note: The backend will automatically generate a `sessionId` cookie on the first request and attach it to the response. The browser will handle sending it back on subsequent requests.*

### 3. Response Format
On success (HTTP 200), the API returns a JSON object containing the chatbot's answer and the current session ID:
```json
{
  "answer": "Hello! How can I help you with Technipie today?",
  "sessionId": "03d91c48-96f9-4953-bf32-0f8764dee883"
}
```
*(You generally don't need to manually store the `sessionId` on the frontend since the cookie handles it, but it is provided for debugging purposes).*

---

## Error Handling & Rate Limiting

The backend has safeguards in place that the frontend should gracefully handle.

### 429 Too Many Requests
The API is rate-limited to **20 requests per 15 minutes per IP**.
If exceeded, the API returns a `429` status code.
**Frontend Action**: Show a user-friendly message like *"You are sending messages too fast. Please wait a moment."*

### 400 Bad Request
Returned if the `question` field is missing from the payload.
```json
{
  "error": "Question is required."
}
```

### 500 Internal Server Error
Returned if any of the external AI services (OpenRouter, NVIDIA embeddings, or MongoDB) timeout or fail. The backend handles this gracefully rather than crashing.
```json
{
  "error": "We're having trouble right now, try again shortly."
}
```
**Frontend Action**: Display this fallback error message in the chat UI.

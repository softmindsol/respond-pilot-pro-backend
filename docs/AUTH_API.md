# Authentication API Documentation

Base URL: `http://localhost:5000/api/auth`

## 1. Register User

**Endpoint:** `/register`
**Method:** `POST`
**Description:** Register a new user with email and password.

### Request Body

| Field      | Type   | Required | Description                    |
| ---------- | ------ | -------- | ------------------------------ |
| `name`     | String | Yes      | User's full name (min 2 chars) |
| `email`    | String | Yes      | Valid email address            |
| `password` | String | Yes      | User's password (min 6 chars)  |

**Example Request:**

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "secretpassword"
}
```

### Success Response (201 Created)

```json
{
  "_id": "651a1b2c3d4e5f6a7b8c9d0e",
  "name": "John Doe",
  "email": "john@example.com",
  "plan": "Free",
  "token": "eyJhbGciOiJIUzI1NiIsInR..."
}
```

### Error Response (400 Bad Request)

```json
{
  "message": "User already exists"
  // OR Zod validation errors
}
```

---

## 2. Login User

**Endpoint:** `/login`
**Method:** `POST`
**Description:** Authenticate a user and return a JWT token.

### Request Body

| Field      | Type   | Required | Description              |
| ---------- | ------ | -------- | ------------------------ |
| `email`    | String | Yes      | Registered email address |
| `password` | String | Yes      | User's password          |

**Example Request:**

```json
{
  "email": "john@example.com",
  "password": "secretpassword"
}
```

### Success Response (200 OK)

```json
{
  "_id": "651a1b2c3d4e5f6a7b8c9d0e",
  "name": "John Doe",
  "email": "john@example.com",
  "plan": "Free",
  "token": "eyJhbGciOiJIUzI1NiIsInR..."
}
```

### Error Response (401 Unauthorized)

```json
{
  "message": "Invalid email or password"
}
```

---

## 3. Get User Profile

**Endpoint:** `/profile`
**Method:** `GET`
**Description:** Get the currently logged-in user's profile data.
**Authentication:** Required (Bearer Token)

### Headers

| Header          | Value                      | Description                            |
| --------------- | -------------------------- | -------------------------------------- |
| `Authorization` | `Bearer <your_token_here>` | JWT Token received from login/register |

### Success Response (200 OK)

```json
{
  "_id": "651a1b2c3d4e5f6a7b8c9d0e",
  "name": "John Doe",
  "email": "john@example.com",
  "plan": "Free",
  "repliesUsed": 0,
  "isGoogleAuth": false,
  "createdAt": "2025-12-17T10:00:00.000Z",
  "updatedAt": "2025-12-17T10:00:00.000Z",
  "__v": 0
}
```

### Error Response (401 Unauthorized)

```json
{
  "message": "Not authorized, token failed"
}
```

---

## 4. Google Login

**Endpoint:** `/google`
**Method:** `POST`
**Description:** Authenticate or Register a user using Firebase Google ID Token.

### Request Body

| Field     | Type   | Required | Description                              |
| --------- | ------ | -------- | ---------------------------------------- |
| `idToken` | String | Yes      | Firebase ID Token received from frontend |

**Example Request:**

```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZC..."
}
```

### Success Response (200 OK)

```json
{
  "_id": "651a1b2c3d4e5f6a7b8c9d0e",
  "name": "John Doe",
  "email": "john@example.com",
  "plan": "Free",
  "token": "eyJhbGciOiJIUzI1NiIsInR..."
}
```

### Error Response (401 Unauthorized)

```json
{
  "message": "Invalid Firebase ID token: ..."
}
```

---

## 5. Forgot Password

**Endpoint:** `/forgot-password`
**Method:** `POST`
**Description:** Send an OTP to the user's email for password reset.

### Request Body

| Field   | Type   | Required | Description             |
| ------- | ------ | -------- | ----------------------- |
| `email` | String | Yes      | User's registered email |

**Example Request:**

```json
{
  "email": "john@example.com"
}
```

### Success Response (200 OK)

```json
{
  "message": "Email sent"
}
```

---

## 6. Verify OTP

**Endpoint:** `/verify-otp`
**Method:** `POST`
**Description:** Verify the OTP sent to the user's email.

### Request Body

| Field   | Type   | Required | Description  |
| ------- | ------ | -------- | ------------ |
| `email` | String | Yes      | User's email |
| `otp`   | String | Yes      | 6-digit OTP  |

**Example Request:**

```json
{
  "email": "john@example.com",
  "otp": "123456"
}
```

### Success Response (200 OK)

```json
{
  "resetToken": "eyJhbGciOiJIUzI1NiIsInR..."
}
```

---

## 7. Reset Password

**Endpoint:** `/reset-password`
**Method:** `POST`
**Description:** Set a new password using the reset token.

### Request Body

| Field         | Type   | Required | Description                         |
| ------------- | ------ | -------- | ----------------------------------- |
| `resetToken`  | String | Yes      | Token received from Verify OTP step |
| `newPassword` | String | Yes      | New password (min 6 chars)          |

**Example Request:**

```json
{
  "resetToken": "eyJhbGciOiJIUzI1NiIsInR...",
  "newPassword": "newsecretpassword"
}
```

### Success Response (200 OK)

```json
{
  "message": "Password updated successfully"
}
```

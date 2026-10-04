# ScholarPath PK — Security and Privacy Requirements

## Authentication

Use Supabase Auth. Every protected request must be authenticated.

## Authorization

Roles:

- student
- mentor
- admin

Do not trust a frontend role value. Authorization must be enforced server-side and through database policies.

## Row Level Security

RLS is mandatory for user-owned records.

Minimum principle:

```text
User A → only User A private records
User B → only User B private records
Admin → privileged management access
```

## Documents

Student documents must be private.

- private storage bucket
- owner-based policies
- no permanent public URLs
- validate MIME type
- enforce file-size limits
- virus/malware scanning can be considered later

## AI API Keys

Never expose Gemini/Grok secrets in browser code.
Use environment variables and server-side Edge Functions.

## AI Data Minimization

Only send the minimum information needed to complete an AI task.
Avoid sending identity documents when unnecessary.

## Admin

Admin cannot be self-created through public signup.
Admin assignment must be controlled separately.

## Audit

Record sensitive admin operations in `admin_actions`.

## User-Controlled Actions

The application must never silently submit official applications or send external communication as the student.

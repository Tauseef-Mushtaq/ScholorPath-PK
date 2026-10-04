# ScholarPath PK — Page and Authorization Map

## Public Pages

| Route | Guest | Student | Mentor | Admin |
|---|---:|---:|---:|---:|
| `/` | ✅ | ✅ | ✅ | ✅ |
| `/scholarships` | ✅ | ✅ | ✅ | ✅ |
| `/scholarships/[id]` | ✅ | ✅ | ✅ | ✅ |
| `/countries` | ✅ | ✅ | ✅ | ✅ |
| `/countries/[country]` | ✅ | ✅ | ✅ | ✅ |
| `/mentors` | ✅ | ✅ | ✅ | ✅ |
| `/mentors/[id]` | ✅ | ✅ | ✅ | ✅ |

## Authentication Pages

| Route | Guest | Student | Mentor | Admin |
|---|---:|---:|---:|---:|
| `/login` | ✅ | redirect | redirect | redirect |
| `/signup` | ✅ | redirect | redirect | redirect |
| `/forgot-password` | ✅ | limited | limited | limited |

## Student Pages

| Route | Guest | Student | Mentor | Admin |
|---|---:|---:|---:|---:|
| `/dashboard` | ❌ | ✅ | ✅ | optional |
| `/profile` | ❌ | own | own | privileged |
| `/documents` | ❌ | own | own | restricted |
| `/matches` | ❌ | ✅ | ✅ | ✅ |
| `/applications` | ❌ | own | own | ✅ |
| `/applications/[id]` | ❌ | own | own | ✅ |
| `/ai/*` | ❌ | ✅ | ✅ | ✅ |

## Mentor Pages

| Route | Guest | Student | Mentor | Admin |
|---|---:|---:|---:|---:|
| `/mentor/apply` | ❌ | ✅ | optional | ✅ |
| `/mentor/dashboard` | ❌ | ❌ | ✅ | ✅ |
| `/mentor/stories/new` | ❌ | ❌ | ✅ | ✅ |
| `/mentor/stories/[id]/edit` | ❌ | ❌ | own | ✅ |

## Admin Pages

| Route | Guest | Student | Mentor | Admin |
|---|---:|---:|---:|---:|
| `/admin` | ❌ | ❌ | ❌ | ✅ |
| `/admin/users` | ❌ | ❌ | ❌ | ✅ |
| `/admin/scholarships` | ❌ | ❌ | ❌ | ✅ |
| `/admin/sources` | ❌ | ❌ | ❌ | ✅ |
| `/admin/rag` | ❌ | ❌ | ❌ | ✅ |
| `/admin/mentors` | ❌ | ❌ | ❌ | ✅ |
| `/admin/reports` | ❌ | ❌ | ❌ | ✅ |
| `/admin/settings` | ❌ | ❌ | ❌ | ✅ |

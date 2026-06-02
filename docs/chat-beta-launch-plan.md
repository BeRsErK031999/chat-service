# Chat Beta Launch Plan

## Goal

Prepare the first internal beta feedback loop for desktop chat before expanding the rollout. The beta checks whether 2-5
testers can install the desktop build, open chat, use seeded rooms, exchange messages, and report issues in one clear
place.

This is an operational milestone. Do not add chat features, change authentication, change SSE, change navigation, change
ActivityPanel, or adjust desktop UI as part of this launch.

## Feedback Group

Create an internal group named `Chat Beta Feedback`.

Use this group for all tester reports, questions, screenshots, and launch coordination. Keep fixes and implementation
discussion outside the tester thread until triage is complete.

## Participants

- 2-5 internal testers from the first beta group.
- One launch owner who sends instructions and confirms installation.
- One triage owner who groups feedback after the collection window.
- Engineering participants who answer clarifying questions, but do not start immediate fixes from the feedback thread.

## Duration

Run the first collection window for 2 working days after tester instructions are sent. Extend to 3-5 working days only if
installation or access issues prevent meaningful testing on the first day.

## Tester Flow

1. Install `Time Tracker Desktop Setup 0.1.24.exe`.
2. Sign in to the desktop app.
3. Open chat with `Ctrl+Shift+Alt+C`.
4. Test the scope from [Chat Beta Scope](./chat-beta-scope.md).
5. Send feedback to `Chat Beta Feedback` using [Chat Beta Feedback Template](./chat-beta-feedback-template.md).

## Feedback Classification

Use these categories from [Chat Beta Triage](./chat-beta-triage.md):

- `Critical` - blocks chat usage or prevents testing from continuing.
- `Major` - strongly interferes with normal usage.
- `Minor` - inconvenience, confusing behavior, or small improvement.
- `Idea` - product suggestion for a future phase.

## Launch Operations

Before sending the installer to testers:

1. Confirm the desktop installer is the 0.1.24 build.
2. Confirm the office `chat-service` health endpoint responds.
3. Seed beta rooms on the office backend database, not only on a local database.
4. Confirm authenticated `/rooms` returns the seeded beta rooms.
5. Confirm the feedback group exists and the tester message has been sent.

For a deployed server artifact, the seed command is:

```powershell
yarn build
yarn chat:seed-beta-rooms:server
```

Run it only in the environment where the office backend has its real `DATABASE_URL` and chat secrets configured. Do not
print secrets in launch notes.

## Related Documents

- [Chat Beta Scope](./chat-beta-scope.md)
- [Chat Beta Feedback Template](./chat-beta-feedback-template.md)
- [Chat Beta Tester Message](./chat-beta-tester-message.md)
- [Chat Beta Triage](./chat-beta-triage.md)
- [Chat Beta Launch Checklist](./chat-beta-launch-checklist.md)

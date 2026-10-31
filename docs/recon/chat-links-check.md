# Do chat messages render URLs as tappable links? — read-only check

**Asked:** 2026-10-30, as input to the links-consistency slice.
**Answer: FOUND.** Chat message text is already linkified, in one place, for
both chat screens. **No code was changed by this check.**

---

## Where

**`src/components/chat/ChatBubble.tsx`** — the single renderer of a message
body. It is used by **`src/screens/TeamChatRoomScreen.tsx`** and
**`src/screens/DMChatScreen.tsx`**, and those are the only two screens that
render chat messages, so there is no second, unlinkified path. (The other
`message.content` hits in those two files — `DMChatScreen.tsx:408`,
`TeamChatRoomScreen.tsx:648` — are reply-preview strings, not message bodies.)

| Thing | Line |
|---|---|
| `URL_SPLIT` — the capture-group split regex | `ChatBubble.tsx:29` |
| `URL_TEST` — is this run a link | `:30` |
| `TRAILING_PUNCTUATION` — peeled off the tail | `:31` |
| `openUrl()` — `Linking.openURL` + an Alert on failure | `:33–38` |
| `renderMessageText()` — the linkifier | `:43–73` |
| the call site, in the message body `<Text>` | `:619–622` |
| link styles `linkTextOwn` / `linkTextOther` (white / underlined) | `:811`, `:815` |

## Which schemes

```js
const URL_SPLIT = /((?:https?:\/\/|www\.)[^\s]+)/gi;
```

| Scheme | Tappable today | Note |
|---|---|---|
| `https://` | **yes** | passed to `Linking.openURL` as written |
| `http://` | **yes** | same |
| bare `www.` | **yes** | upgraded to `https://` before opening (`:59`) |
| **`thryvyng://`** (the app's own) | **NO** | not matched; renders as plain text |
| `mailto:` | no | not matched |
| `tel:` | no | not matched |

Behaviour worth recording: trailing punctuation is peeled off the match
(`:54–56`), so "see https://x.com/a." opens `https://x.com/a` and the full stop
stays as text; and `renderMessageText` returns the plain string unchanged when
the text holds no link (`:47`), so the common message allocates nothing extra.
A failed open raises `Alert.alert('Could not open link', href)` rather than
failing silently.

## The gap that matters for the links-consistency slice

**An in-app deep link pasted into chat is dead text.** The app's own URL scheme
is `thryvyng://` with universal links on `https://thryvyng.com` and
`https://www.thryvyng.com` (`src/navigation/linking.ts`). A `thryvyng://…` link
in a message is not matched by `URL_SPLIT`, so it is not tappable; a
`https://thryvyng.com/…` link **is** matched, but it is handed to
`Linking.openURL`, which hands it to the OS — on a device with universal links
registered that re-enters the app, and otherwise it opens the website.

## Proposed default — one line, not built here

**Match the app's own scheme too and route in-app links through the navigator
instead of the OS:** add `thryvyng://` to `URL_SPLIT` / `URL_TEST`, and in
`openUrl()` send any `thryvyng://` or `thryvyng.com` href to React
Navigation's linking (so it pushes a screen) rather than to
`Linking.openURL` (which leaves the app and bounces back).

**NOT DECIDED, and worth one ruling before it is built:** whether a pasted
deep link should be trusted at all — a chat message is user content, and a tap
on it would navigate another member somewhere they did not choose. Allow-list
the paths that are safe to open from a message, or open them unconditionally.
That is a product call, not this room's.

## What this check did NOT cover

* **Chat cards** — `PollCard.tsx`, `SurveyChatCard.tsx` and the attachment
  renderers were not read for link handling; only the message body was asked
  about. `AttachmentViewer.tsx:139–144` does its own `Linking.canOpenURL` /
  `openURL` for files, which is a different path.
* **Every other surface** — event notes, announcements, team resources and
  profile fields were not checked. `Linking.openURL` appears in 15 screens
  (`grep -rn "Linking.openURL" src/screens`), all of them opening a URL the
  code built, none of them linkifying user text. **`ChatBubble` is the only
  linkifier in `src/`.**
* **Nothing was run** — this is a read of the source, not a device test. No
  message with a link was sent or tapped.

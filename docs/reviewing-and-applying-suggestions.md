# Reviewing and applying suggestions

When the AI rewrites a passage or reviews your work, the result comes back inside
your document, where you can weigh it against what you wrote and take it or leave
it. This page covers reading an inline rewrite and accepting it change by change,
working with margin notes, and coming back to a result in the panel to refine it.

## Reading a rewrite as an inline diff

When you run a rewrite on a selection, the AI's version appears right where your
text is, shown as a diff: the words it would remove and the words it would add,
in place, so you can see exactly how heavy-handed the change is. Your document
isn't altered yet — nothing changes on the page until you say so.

Each distinct change carries a small **accept** and **reject** control. Accept
and that change takes effect; reject and your original stands. You go through
them one at a time, keeping the changes you like and dropping the ones you don't.

When there's more than one change, a small bar at the top of the editor shows how
many are outstanding, with **Accept all** and **Reject all** for when you've
decided about the whole thing at once.

Accepting a change is recorded in your workspace history, so even after you've
taken a rewrite you can get the previous wording back; see
[Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md).

## Working with margin notes

When an action reviews your writing rather than rewriting it — Story Reviewer,
for instance — its feedback comes back as notes pinned to the parts of the text
they're about. Each note is a small numbered card in the margin, linked to the
exact span it refers to, showing who left it, the words it's about, and the
comment.

What you can do with a note depends on what it is:

- If the note comes with a suggested change, its card has an **Accept** button
  that makes that change for you (again, recorded in history).
- Otherwise you can **edit** it, **collapse** it to get it out of the way, or
  **dismiss** it when you're done with it.

A bar at the top of the editor counts the open notes and lets you collapse or
expand them all together. These are the same margin notes you can leave yourself
with the **Note** button (see [Writing and editing text](writing-and-editing-text.md)),
and they're saved with your workspace, so AI feedback and your own reminders both
survive closing and reopening the file.

## Refining a result in the panel

Every action you run is also recorded as a **run** in the panel at the bottom of
the window — what you asked, which model answered, and the response as it
streamed in. When the result is shown inline in your document, the run points you
up to it rather than repeating it. When it isn't — a rewrite of a whole document,
say — the run offers an **Apply** button to drop the new version in, and a way to
copy it instead.

A run is also where you go back for another try without losing what you have:

- **Refine** lets you give the AI a short note about what to change — "softer
  tone, keep the comma" — and answers again with your note in hand.
- **Rerun** asks the same thing afresh.

Runs stick around for the session, so you can line up attempts and pick the best,
and come back to an earlier one to refine it further.

## Checking your workspace for problems

The bottom panel also keeps a list of **problems** Canv finds across your
workspace — links to files that aren't there, references to headings that don't
exist, images that point nowhere. Each one links to the line it's on, so you can
jump straight to it. You can turn individual checks on or off in settings, and
rescan after you've moved files around.

## Up next

Once you've applied a result, the next question is usually "can I get the old
version back?" — see
[Tracking changes and keeping things tidy](tracking-changes-and-keeping-things-tidy.md).

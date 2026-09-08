# Recording Project Title Tooltip Design

## Goal

Let users identify recording projects whose visible card titles are truncated, without renaming projects or changing the card layout.

## Behavior

- Keep the recording title on one line with the existing ellipsis.
- Measure the rendered title, and enable the existing application tooltip only when the title actually overflows its available width.
- Show the exact full `pretty_name` after the tooltip component's existing 200 ms hover delay.
- Recalculate overflow when the card width changes so resizing the window cannot leave the tooltip in the wrong state.
- Limit the change to recording project cards. Display, window, and screenshot cards retain their current behavior.

## Implementation

Extract a small DOM-independent overflow predicate for unit testing. In `TargetCard`, keep a reference to the title element, update a `truncated` signal after rendering, and observe width changes with `ResizeObserver`. Wrap the recording title in the shared `Tooltip` component, disabling it whenever the title fits.

## Verification

- Unit-test the overflow predicate at equal, underflow, and overflow widths.
- Run the focused test first in a failing state and again after implementation.
- Run the desktop TypeScript/Vinxi build to catch Solid component and bundling regressions.


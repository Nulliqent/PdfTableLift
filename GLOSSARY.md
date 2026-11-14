# Table Lift

Table Lift lifts tables out of text-based PDFs so they can be corrected and copied elsewhere, without the PDF leaving the user's device.

## Documents

**Document**:
A PDF the user has opened in the workspace.
_Avoid_: File

**Example Document**:
The Document preloaded for first-time visitors, removed as soon as the user opens their own.
_Avoid_: Sample, demo

## Tables

**Table**:
A grid of cells lifted from one or more pages of a Document.

**Detected Table**:
A Table found automatically on a page.
_Avoid_: Auto table

**Hand-drawn Table**:
A Table built only from the text inside a Region the user drew; shown as "Selected by hand". It replaces any Detected Table it covers and is never part of a Joined Table.
_Avoid_: Manual table, custom table

**Region**:
The rectangle on a page that a Hand-drawn Table is built from.
_Avoid_: Selection, area, box

**Removed Table**:
A Detected Table the user has dismissed; it can be restored.
_Avoid_: Dismissed table, deleted table

## Joining

**Joined Table**:
A Table that continues across consecutive pages, assembled from its Parts.
_Avoid_: Merged table, continued table

**Part**:
The piece of a Joined Table that lies on a single page.
_Avoid_: Fragment, segment

## Structure

**Header Row**:
The first row of a Table when it names the columns.

**Section Header**:
A lone label row inside a Table that groups the rows beneath it, such as "West".
_Avoid_: Group row, subheading

**Section Mode**:
How Section Headers are presented: **As Column** (a leading Section column on every row) or **As Rows** (Section Headers kept as their own rows).

**Column Spacing**:
The user-tunable factor that decides how far apart words must be to fall into separate columns.
_Avoid_: Gap, threshold

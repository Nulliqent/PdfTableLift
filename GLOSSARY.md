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
A Table built only from the text inside the Regions the user drew, all on one page; shown as "Selected by hand". It replaces any Detected Table it covers and is never part of a Joined Table.
_Avoid_: Manual table, custom table

**Region**:
A rectangle on a page that a Hand-drawn Table is built from. A Hand-drawn Table has one or more Regions, each a Header Region or a Body Region.
_Avoid_: Selection, area, box

**Header Region**:
The Region whose text becomes the Header Row of its Hand-drawn Table, always as one Row, wherever it lies on the page. A Hand-drawn Table has at most one.

**Body Region**:
A Region whose text becomes the Rows of its Hand-drawn Table.

**Single-Row Region**:
A Body Region the user declares to hold exactly one Row, so all its text becomes one Row however many lines it spans.

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

**Stacked Table**:
A Table the user makes from several Tables of one Document that share the same Header Row, by putting their Rows one after another; it always shows its Members as they stand.
_Avoid_: Combined table (Combine is for Rows), joined table (reserved for Joined Tables), merged table

**Member**:
One of the Tables a Stacked Table is made from.

## Structure

**Cell**:
One entry of a Table, at the meeting of a Row and a column.

**Row**:
All the text of a Table that belongs together, even when it runs over several lines of the page.
_Avoid_: Line (a line is a single line of text on the page, and a Row may span several)

**Combine**:
To put a Row together with the Row directly above or below it, so each Cell holds both Rows' text; a correction the user makes by hand.
_Avoid_: Join (reserved for Joined Tables), merge

**Split back**:
To undo the most recent Combine on a Row, restoring the two Rows it came from.
_Avoid_: Unmerge, separate

**Wrapped Cell**:
A Cell whose text runs over more than one line, whether the other Cells of its Row sit beside the first line, the last, or the middle.

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

# Pdf Table Lift — User Stories

Table Lift is a web app that extracts tables from text-based PDFs using drag and drop. It is designed to follow Apple's Human Interface Guidelines.

Stories added in the latest release are marked **(new)**.

---

## 1. Getting PDFs in

| ID | User story |
|---|---|
| US-01 | As an analyst, I want to drag one or more PDFs anywhere onto the window, so I don't have to aim at a small target. |
| US-02 | As a user, I want a clear drop overlay while I'm dragging, so I know the drop will be accepted. |
| US-03 | As a user, I want to choose files with an Open PDF button or ⌘O, so I can work without dragging. |
| US-04 | As a privacy-conscious user, I want my files read on my own device, so confidential documents are never uploaded. |
| US-05 | As a user, I want non-PDF files rejected with a clear message, so I know why nothing happened. |
| US-06 | As a first-time visitor, I want an example PDF already loaded, so I can see what the app does before using my own file. |
| US-07 | As a user, I want the example removed when I add my own PDF, so my workspace only shows my documents. |

## 2. Finding tables

| ID | User story |
|---|---|
| US-08 | As a user, I want every table on every page detected automatically, so I don't have to select regions by hand. |
| US-09 | As a user, I want headings, captions and footnotes kept out of tables, so the extracted data is clean. |
| US-10 | As a user, I want two tables on the same page kept separate, so their data doesn't merge. |
| US-11 | As a user, I want text that wraps inside a cell kept in that cell, including in right-aligned columns, so long notes don't become extra rows. |
| US-12 | As a user, I want a Column spacing slider that re-detects tables instantly, so I can fix columns that split apart or run together. |
| US-13 | As a returning user, I want my slider setting remembered, so I don't have to tune it again. |
| US-14 | **(new)** As a user with PDFs that store each row as one text string, I want columns separated by runs of spaces recognized, so those tables are detected too. |

## 3. Section headers

| ID | User story |
|---|---|
| US-15 | As a user, I want section labels inside a table (like "West") recognized as section headers, so they don't break the table or pose as data rows. |
| US-16 | As an analyst, I want to show sections as a Section column, so every row carries its group for sorting and pivots. |
| US-17 | As a user, I want to show sections as their own rows instead, so the table matches the PDF's layout. |
| US-18 | As a user, I want to mark or unmark a row as a section header by clicking its row number, so I can fix wrong guesses. |

## 4. Tables across pages (new)

| ID | User story |
|---|---|
| US-19 | As a user, I want a table that continues onto the next page joined into one table, so I don't have to stitch the parts together. |
| US-20 | As a user, I want a header row repeated on the next page removed when tables are joined, so it doesn't appear as data. |
| US-21 | As a user, I want a section that crosses a page break kept intact, so rows on the next page keep their section. |
| US-22 | As a user, I want separate tables on consecutive pages left unjoined when their headers or columns differ, so unrelated data isn't merged. |
| US-23 | As a user, I want to see the page range of a joined table, like "Pages 2–3", so I know where its data came from. |
| US-24 | As a user, I want to split a joined table with Split by Page and undo it with Join Again, so I can correct a wrong join. |
| US-25 | As a user, I want a switch to turn joining off for all documents, remembered between visits. |
| US-26 | As a user, I want Source Page to show every page of a joined table, with each part outlined and labelled. |

## 5. Selecting a region by hand (new)

| ID | User story |
|---|---|
| US-27 | As a user whose table wasn't detected, I want to drag a box around it on the page, so I can still extract it. |
| US-28 | As a user, I want to step through any page of the document while selecting, including pages with no detected tables. |
| US-29 | As a user, I want a live preview of the rows and columns while I drag, so I can see the result before saving. |
| US-30 | As a user, I want the Column spacing slider to update that preview, so I can fix columns inside my selection. |
| US-31 | As a user, I want to redraw the region of a detected table that was cut off or picked up extra text, so I can fix it without starting over. |
| US-32 | As a user, I want my hand-drawn table to replace any detected table it covers, so I don't get duplicates. |
| US-33 | As a keyboard user, I want a Select Whole Page option, so I can make a selection without dragging. |
| US-34 | As a user, I want hand-drawn tables marked "Selected by hand", so I can tell them apart from detected ones. |
| US-35 | As a user, I want to remove a wrongly detected table and restore removed tables from the sidebar, so mistakes are reversible. |
| US-36 | As a user, I want Escape or Cancel to leave region selection without changes. |

## 6. Reviewing and correcting

| ID | User story |
|---|---|
| US-37 | As a user, I want a sidebar listing each document and its tables with page, size and section count, so I can move between them quickly. |
| US-38 | As a user, I want to see the source page with each detected table outlined, so I can check what was captured. |
| US-39 | As a user, I want to click an outline on the source page to open that table. |
| US-40 | As a user, I want to edit any cell in place, so I can fix extraction errors before copying. |
| US-41 | As a user, I want to turn "First row is header" on or off, so tables without a header row export correctly. |
| US-42 | As a user, I want numeric columns right-aligned with even-width digits, so figures are easy to compare. |
| US-43 | As a user, I want to remove a document from the list, so I can clear out files I'm done with. |

## 7. Exporting

| ID | User story |
|---|---|
| US-44 | As a user, I want to copy a table as CSV, TSV, Markdown or JSON, so it fits wherever I'm pasting it. |
| US-45 | As a spreadsheet user, I want TSV to paste straight into Numbers, Excel or Google Sheets, so the columns land correctly. |
| US-46 | As a developer, I want JSON keyed by the header names, and grouped by section in As Rows mode, so the data is ready to use in code. |
| US-47 | As a writer, I want Markdown to keep numeric columns right-aligned and show section headers in bold. |
| US-48 | As a user, I want a brief "Copied" confirmation, so I know the copy worked. |
| US-49 | As a user whose browser blocks clipboard access, I want the text shown pre-selected so I can copy it myself, so export never dead-ends. |
| US-50 | As a returning user, I want my export format and section choice remembered. |

## 8. Errors and edge cases

| ID | User story |
|---|---|
| US-51 | As a user with a scanned PDF, I want to be told it has no text layer and needs OCR, so I understand why no tables appear. |
| US-52 | As a user with a password-protected PDF, I want a clear message telling me to remove the password. |
| US-53 | As a user, I want a helpful screen when no tables are found, offering to select a region by hand or adjust Column spacing. |
| US-54 | **(new)** As a user, I want to be told when my selection contains no text, so I know to choose a different area. |

## 9. Design and accessibility

| ID | User story |
|---|---|
| US-55 | As a Mac or iPhone user, I want the interface to follow Apple's Human Interface Guidelines (translucent toolbar, source-list sidebar, segmented controls, switches, page stepper), so it feels familiar. |
| US-56 | As a user, I want it to follow my light or dark appearance setting. |
| US-57 | As a phone user, I want the layout to stack into one column, including region selection with my finger. |
| US-58 | As a keyboard user, I want every control reachable with visible focus, and Enter to finish editing a cell. |
| US-59 | As a user who prefers reduced motion, I want animations turned off. |


# Client-only: no backend

Table Lift reads and extracts PDFs entirely in the browser, and the Docker image only serves static files. This follows from US-04 (confidential documents are never uploaded). So there is no API, no server-side extraction and no stored data, and features that would need a server, such as OCR for scanned PDFs (US-51), are out of scope unless they can also run on the device.

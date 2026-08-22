import zlib from 'zlib';
import { getAccessToken } from './amazon-token-service.js';

// Amazon.in is grouped under the EU SP-API region (https://developer-docs.amazon.com/sp-api/docs/sp-api-endpoints).
const SP_API_HOST = 'https://sellingpartnerapi-eu.amazon.com';
const INDIA_MARKETPLACE_ID = 'A21TJRUUN4KGV';

const REPORT_POLL_INTERVAL_MS = 3000;
// Kept under common reverse-proxy/platform request timeouts (Render et al. often cap around
// ~100s) — the frontend request that triggers this stays open for the whole poll loop.
const REPORT_POLL_TIMEOUT_MS = 90 * 1000;

interface CreateReportResponse { reportId: string }
interface GetReportResponse {
  reportId: string;
  processingStatus: 'IN_QUEUE' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED' | 'FATAL';
  reportDocumentId?: string;
}
interface GetReportDocumentResponse {
  url: string;
  compressionAlgorithm?: 'GZIP';
}

/** Thrown when Amazon's report generation doesn't finish within our polling window — the report
 * may still complete on Amazon's side, this just means we gave up waiting for this request. */
export class ReportTimeoutError extends Error {
  constructor() {
    super('Amazon report generation is taking longer than expected. Please try again shortly.');
    this.name = 'ReportTimeoutError';
  }
}

/** Thrown when the report itself failed on Amazon's side (rather than our request failing). */
export class ReportFailedError extends Error {
  constructor(status: string) {
    super(`Amazon report generation ended with status ${status}.`);
    this.name = 'ReportFailedError';
  }
}

async function spApiFetch(uid: string, path: string, init: RequestInit = {}) {
  const accessToken = await getAccessToken(uid);
  return fetch(`${SP_API_HOST}${path}`, {
    ...init,
    headers: {
      ...(init.headers as Record<string, string> | undefined),
      'x-amz-access-token': accessToken,
      'Content-Type': 'application/json',
    },
  });
}

/** Requests a report of type `reportType` for `uid`'s Amazon account, waits for it to finish,
 * and returns the parsed rows. Amazon's flat-file reports are tab-delimited with a header row;
 * this reads columns by name rather than fixed position, since the exact column set has varied
 * slightly across marketplaces/report versions over the years. */
export async function fetchMerchantListingsReport(uid: string, reportType: string): Promise<Record<string, string>[]> {
  const createResponse = await spApiFetch(uid, '/reports/2021-06-30/reports', {
    method: 'POST',
    body: JSON.stringify({ reportType, marketplaceIds: [INDIA_MARKETPLACE_ID] }),
  });
  if (!createResponse.ok) {
    console.error('Amazon create report failed', createResponse.status, await createResponse.text());
    throw new Error('Failed to request an inventory report from Amazon.');
  }
  const { reportId } = await createResponse.json() as CreateReportResponse;

  const deadline = Date.now() + REPORT_POLL_TIMEOUT_MS;
  let reportDocumentId: string | undefined;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, REPORT_POLL_INTERVAL_MS));

    const statusResponse = await spApiFetch(uid, `/reports/2021-06-30/reports/${reportId}`);
    if (!statusResponse.ok) {
      console.error('Amazon get report status failed', statusResponse.status, await statusResponse.text());
      throw new Error('Failed to check Amazon report status.');
    }
    const statusBody = await statusResponse.json() as GetReportResponse;

    if (statusBody.processingStatus === 'DONE') {
      reportDocumentId = statusBody.reportDocumentId;
      break;
    }
    if (statusBody.processingStatus === 'CANCELLED' || statusBody.processingStatus === 'FATAL') {
      throw new ReportFailedError(statusBody.processingStatus);
    }
    // IN_QUEUE / IN_PROGRESS — keep polling.
  }

  if (!reportDocumentId) {
    throw new ReportTimeoutError();
  }

  const documentResponse = await spApiFetch(uid, `/reports/2021-06-30/documents/${reportDocumentId}`);
  if (!documentResponse.ok) {
    console.error('Amazon get report document failed', documentResponse.status, await documentResponse.text());
    throw new Error('Failed to retrieve the Amazon inventory report.');
  }
  const { url, compressionAlgorithm } = await documentResponse.json() as GetReportDocumentResponse;

  // The document URL is a presigned S3 link — no Amazon auth headers involved.
  const fileResponse = await fetch(url);
  if (!fileResponse.ok) {
    throw new Error('Failed to download the Amazon inventory report file.');
  }
  const rawBuffer = Buffer.from(await fileResponse.arrayBuffer());
  const textBuffer = compressionAlgorithm === 'GZIP' ? zlib.gunzipSync(rawBuffer) : rawBuffer;
  // Strip a leading UTF-8 BOM if present — Amazon's flat-file reports sometimes include one,
  // which would otherwise corrupt the *first* header's key (e.g. "item-name" silently becomes
  // "﻿item-name"), making every row's row['item-name'] lookup come back undefined.
  const BOM = '﻿';
  const text = textBuffer.toString('utf-8').replace(new RegExp(`^${BOM}`), '');

  const lines = text.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const headers = lines[0].split('\t');
  // TEMPORARY: logs the actual column names this report came back with, so a field-mapping
  // mismatch (e.g. name/image showing up wrong) can be diagnosed from Render logs precisely
  // instead of guessed at — remove once the mapping in the sync route is confirmed correct.
  console.error('Amazon report headers:', JSON.stringify(headers));

  return lines.slice(1).map((line) => {
    const cells = line.split('\t');
    const row: Record<string, string> = {};
    headers.forEach((header, i) => { row[header] = cells[i] ?? ''; });
    return row;
  });
}

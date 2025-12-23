import "server-only";

import crypto from "node:crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const BUCKET = "utility-bills";
const BILL_TYPES = ["ELECTRICITY", "WATER", "GAS", "TELECOM", "TAX", "ETC"] as const;
type BillType = (typeof BILL_TYPES)[number];

type OcrResult = {
  text: string;
  raw: unknown;
  fieldsCount: number;
};

type ClovaField = {
  inferText?: string;
};

type ClovaTableCell = {
  cellText?: string;
};

type ClovaTable = {
  cells?: ClovaTableCell[];
};

type ClovaImage = {
  fields?: ClovaField[];
  tables?: ClovaTable[];
};

type ClovaResponse = {
  images?: ClovaImage[];
};

type CvMat = {
  data: Uint8Array;
  data32S: Int32Array;
  rows: number;
  cols: number;
  channels: () => number;
  delete: () => void;
};

type CvMatVector = {
  size: () => number;
  get: (index: number) => CvMat;
  delete: () => void;
};

type OpenCv = {
  Mat: { new(...args: number[]): CvMat; ones: (rows: number, cols: number, type: number) => CvMat };
  MatVector: { new(): CvMatVector };
  Size: { new(width: number, height: number): unknown };
  Point: { new(x: number, y: number): unknown };
  COLOR_RGBA2GRAY: number;
  CV_8UC4: number;
  CV_8U: number;
  CV_32FC2: number;
  RETR_LIST: number;
  CHAIN_APPROX_SIMPLE: number;
  ADAPTIVE_THRESH_GAUSSIAN_C: number;
  THRESH_BINARY: number;
  cvtColor: (src: CvMat, dst: CvMat, code: number) => void;
  GaussianBlur: (src: CvMat, dst: CvMat, ksize: unknown, sigmaX: number) => void;
  Canny: (src: CvMat, dst: CvMat, threshold1: number, threshold2: number) => void;
  dilate: (src: CvMat, dst: CvMat, kernel: CvMat, anchor: unknown, iterations: number) => void;
  findContours: (image: CvMat, contours: CvMatVector, hierarchy: CvMat, mode: number, method: number) => void;
  contourArea: (contour: CvMat) => number;
  arcLength: (curve: CvMat, closed: boolean) => number;
  approxPolyDP: (curve: CvMat, approxCurve: CvMat, epsilon: number, closed: boolean) => void;
  matFromArray: (rows: number, cols: number, type: number, array: number[]) => CvMat;
  getPerspectiveTransform: (src: CvMat, dst: CvMat) => CvMat;
  warpPerspective: (src: CvMat, dst: CvMat, M: CvMat, dsize: unknown) => void;
  bilateralFilter: (src: CvMat, dst: CvMat, d: number, sigmaColor: number, sigmaSpace: number) => void;
  adaptiveThreshold: (src: CvMat, dst: CvMat, maxValue: number, adaptiveMethod: number, thresholdType: number, blockSize: number, C: number) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

type SharpModule = (input: Buffer | ArrayBuffer | string, options?: import("sharp").SharpOptions) => import("sharp").Sharp;

type LlmResult = {
  bill_type: BillType;
  vendor_name: string | null;
  amount_due: number | null;
  due_date: string | null;
  billing_period_start: string | null;
  billing_period_end: string | null;
  customer_no: string | null;
  payment_account: string | null;
  evidence: {
    amount_text: string | null;
    due_date_text: string | null;
    vendor_text: string | null;
  };
  confidence: number;
};

type PreprocessResult = {
  scanBuffer: Buffer;
  trackABuffer: Buffer;
  trackBBuffer: Buffer;
  docDetected: boolean;
  note: string | null;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const nowIso = () => new Date().toISOString();

const normalizeText = (value: unknown) => (typeof value === "string" ? value.trim() : "");

const parseAmount = (value: unknown) => {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value) : null;
  if (typeof value !== "string") return null;
  const numeric = Number(value.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(numeric)) return null;
  return Math.round(numeric);
};

const parseDate = (value: unknown) => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/(\d{4})\D{0,3}(\d{1,2})\D{0,3}(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const mm = String(month).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  return `${year}-${mm}-${dd}`;
};

const sanitizeBillType = (value: unknown): BillType => {
  const text = normalizeText(value).toUpperCase();
  if (BILL_TYPES.includes(text as BillType)) return text as BillType;
  return "ETC";
};

const buildClovaEndpoints = () => {
  const directTemplate = process.env.CLOVA_OCR_ENDPOINT_TEMPLATE ?? "";
  const directGeneral = process.env.CLOVA_OCR_ENDPOINT_GENERAL ?? "";
  const combined = process.env.CLOVA_OCR_ENDPOINTS ?? "";

  if (combined) {
    try {
      const parsed = JSON.parse(combined) as { template?: string; general?: string };
      return {
        template: parsed.template ?? directTemplate,
        general: parsed.general ?? directGeneral,
      };
    } catch {
      const parts = combined.split(",").map((item) => item.trim()).filter(Boolean);
      if (parts.length === 1) {
        return { template: directTemplate, general: parts[0] };
      }
      if (parts.length >= 2) {
        return { template: parts[0], general: parts[1] };
      }
    }
  }

  return { template: directTemplate, general: directGeneral };
};

const buildTemplateIds = () => {
  const raw = process.env.CLOVA_OCR_TEMPLATE_IDS ?? process.env.CLOVA_OCR_TEMPLATE_ID ?? "";
  if (!raw) return [];
  return raw.split(",").map((item) => item.trim()).filter(Boolean);
};

const extractOcrText = (payload: unknown) => {
  const data = isRecord(payload) ? (payload as ClovaResponse) : {};
  const images = Array.isArray(data.images) ? data.images : [];
  const image = images[0] ?? {};
  const fields = Array.isArray(image.fields) ? image.fields : [];
  const tableCells = Array.isArray(image.tables)
    ? image.tables.flatMap((table) => (Array.isArray(table.cells) ? table.cells : []))
    : [];

  const fieldText = fields.map((field) => normalizeText(field?.inferText)).filter(Boolean);
  const tableText = tableCells.map((cell) => normalizeText(cell?.cellText)).filter(Boolean);
  const text = [...fieldText, ...tableText].join("\n").trim();
  return { text, fieldsCount: fields.length, rawFields: fields };
};

const callClovaOcr = async (endpoint: string, image: Buffer, templateIds?: string[]) => {
  const secret = process.env.CLOVA_OCR_SECRET ?? "";
  if (!endpoint || !secret) {
    throw new Error("CLOVA OCR env vars are missing.");
  }

  const payload: Record<string, unknown> = {
    version: "V2",
    requestId: crypto.randomUUID(),
    timestamp: Date.now(),
    lang: "ko",
    images: [
      {
        format: "png",
        name: "utility-bill",
        data: image.toString("base64"),
      },
    ],
    enableTableDetection: true,
  };

  if (templateIds && templateIds.length > 0) {
    payload.templateIds = templateIds;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-OCR-SECRET": secret,
    },
    body: JSON.stringify(payload),
  });

  const data = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) {
    const message = isRecord(data) && typeof data.message === "string" ? data.message : response.statusText;
    throw new Error(`CLOVA OCR failed: ${message}`);
  }

  const extracted = extractOcrText(data);
  return {
    text: extracted.text,
    raw: data,
    fieldsCount: extracted.fieldsCount,
  } satisfies OcrResult;
};

type OpenRouterResponse = {
  choices?: { message?: { content?: string } }[];
  error?: { message?: string };
};

const callOpenRouter = async (ocrText: string, templateFields: ClovaField[] | null) => {
  const apiKey = process.env.OPENROUTER_API_KEY ?? "";
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is missing.");

  const schema = {
    name: "utility_bill",
    strict: true,
    schema: {
      type: "object",
      additionalProperties: false,
      properties: {
        bill_type: { type: "string", enum: BILL_TYPES },
        vendor_name: { type: "string" },
        amount_due: { type: "number" },
        due_date: { type: "string" },
        billing_period_start: { type: ["string", "null"] },
        billing_period_end: { type: ["string", "null"] },
        customer_no: { type: ["string", "null"] },
        payment_account: { type: ["string", "null"] },
        evidence: {
          type: "object",
          additionalProperties: false,
          properties: {
            amount_text: { type: ["string", "null"] },
            due_date_text: { type: ["string", "null"] },
            vendor_text: { type: ["string", "null"] },
          },
          required: ["amount_text", "due_date_text", "vendor_text"],
        },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: [
        "bill_type",
        "vendor_name",
        "amount_due",
        "due_date",
        "billing_period_start",
        "billing_period_end",
        "customer_no",
        "payment_account",
        "evidence",
        "confidence",
      ],
    },
  };

  const userPayload = {
    ocr_text: ocrText,
    template_fields: templateFields,
  };

  const messages = [
    {
      role: "system",
      content:
        "You extract Korean utility bill fields from OCR text. Follow the schema strictly. If uncertain, lower confidence.",
    },
    {
      role: "user",
      content: [
        "다음 OCR 텍스트에서 공과금 고지서를 구조화해줘. 필수 규칙:",
        "- 금액 후보가 여러 개면 '납부할 금액/납부금액/당월/이번달' 근처를 amount_due로 선택",
        "- '미납/연체/가산금'은 amount_due로 선택 금지",
        "- 날짜 후보가 여러 개면 '납부기한/납기/까지' 근처를 due_date로 선택",
        "- 날짜는 YYYY-MM-DD 형식",
        "",
        "OCR 입력:",
        JSON.stringify(userPayload, null, 2),
      ].join("\n"),
    },
  ];

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
  if (process.env.OPENROUTER_SITE_URL) headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
  if (process.env.OPENROUTER_APP_NAME) headers["X-Title"] = process.env.OPENROUTER_APP_NAME;

  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages,
      response_format: { type: "json_schema", json_schema: schema },
    }),
  });

  const data = (await response.json().catch(() => null)) as OpenRouterResponse | null;
  if (!response.ok) {
    const message = typeof data?.error?.message === "string" ? data.error.message : response.statusText;
    throw new Error(`OpenRouter failed: ${message}`);
  }

  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("OpenRouter returned empty content.");
  }

  const parsed = JSON.parse(content) as Partial<LlmResult>;
  return parsed;
};

const evaluateResult = (llm: Partial<LlmResult>, docDetected: boolean, ocrText: string) => {
  const vendorName = normalizeText(llm.vendor_name);
  const amountDue = parseAmount(llm.amount_due);
  const dueDate = parseDate(llm.due_date);
  const billingPeriodStart = parseDate(llm.billing_period_start);
  const billingPeriodEnd = parseDate(llm.billing_period_end);

  let confidence = clamp(typeof llm.confidence === "number" ? llm.confidence : 0.5, 0, 1);
  const evidence = llm.evidence ?? { amount_text: null, due_date_text: null, vendor_text: null };

  if (!vendorName) confidence -= 0.15;
  if (!amountDue || amountDue <= 0) confidence -= 0.4;
  if (!dueDate) confidence -= 0.3;
  if (!evidence.amount_text) confidence -= 0.1;
  if (!evidence.due_date_text) confidence -= 0.1;
  if (!ocrText) confidence -= 0.2;
  if (!docDetected) confidence = Math.min(confidence, 0.6);

  confidence = clamp(confidence, 0, 1);

  const normalized: LlmResult = {
    bill_type: sanitizeBillType(llm.bill_type),
    vendor_name: vendorName || null,
    amount_due: amountDue,
    due_date: dueDate,
    billing_period_start: billingPeriodStart,
    billing_period_end: billingPeriodEnd,
    customer_no: normalizeText(llm.customer_no) || null,
    payment_account: normalizeText(llm.payment_account) || null,
    evidence: {
      amount_text: normalizeText(evidence.amount_text) || null,
      due_date_text: normalizeText(evidence.due_date_text) || null,
      vendor_text: normalizeText(evidence.vendor_text) || null,
    },
    confidence,
  };

  const status = confidence >= 0.85 ? "CONFIRMED" : "NEEDS_REVIEW";
  return { normalized, status };
};

let sharpPromise: Promise<SharpModule> | null = null;
let cvPromise: Promise<OpenCv> | null = null;

const loadSharp = async () => {
  if (!sharpPromise) {
    sharpPromise = import("sharp").then((mod) => (mod.default ?? mod) as SharpModule);
  }
  return sharpPromise;
};

const loadOpenCv = async (timeoutMs = 5000) => {
  if (cvPromise) return cvPromise;
  cvPromise = (async () => {
    try {
      const loadPromise = import("@techstark/opencv-js").then((mod) => {
        const cv = ((mod as unknown) as { default?: OpenCv }).default ?? (mod as unknown as OpenCv);
        if (isRecord(cv) && typeof (cv as Record<string, unknown>).onRuntimeInitialized === "function") {
          return new Promise<OpenCv>((resolve) => {
            (cv as Record<string, unknown>).onRuntimeInitialized = () => resolve(cv);
          });
        }
        return cv;
      });

      return await Promise.race([
        loadPromise,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("OpenCV load timeout")), timeoutMs)
        ),
      ]);
    } catch (err) {
      cvPromise = null; // Allow retry on failure
      throw err;
    }
  })();
  return cvPromise;
};

const detectDocumentCorners = (cv: OpenCv, mat: CvMat) => {
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const edged = new cv.Mat();
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();

  cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
  cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);
  cv.Canny(blurred, edged, 75, 200);
  const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  cv.dilate(edged, edged, kernel, new cv.Point(-1, -1), 2);

  cv.findContours(edged, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

  let best: { points: number[]; area: number } | null = null;
  for (let i = 0; i < contours.size(); i += 1) {
    const contour = contours.get(i);
    const area = cv.contourArea(contour);
    if (area < mat.rows * mat.cols * 0.1) {
      contour.delete();
      continue;
    }
    const peri = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, 0.02 * peri, true);
    if (approx.rows === 4) {
      const pts = Array.from(approx.data32S);
      if (!best || area > best.area) {
        best = { points: pts, area };
      }
    }
    approx.delete();
    contour.delete();
  }

  gray.delete();
  blurred.delete();
  edged.delete();
  contours.delete();
  hierarchy.delete();
  kernel.delete();

  if (!best) return null;

  const points: { x: number; y: number }[] = [];
  for (let i = 0; i < best.points.length; i += 2) {
    points.push({ x: best.points[i], y: best.points[i + 1] });
  }

  if (points.length !== 4) return null;
  return points;
};

const orderPoints = (points: { x: number; y: number }[]) => {
  const sum = points.map((p) => p.x + p.y);
  const diff = points.map((p) => p.x - p.y);
  const tl = points[sum.indexOf(Math.min(...sum))];
  const br = points[sum.indexOf(Math.max(...sum))];
  const tr = points[diff.indexOf(Math.min(...diff))];
  const bl = points[diff.indexOf(Math.max(...diff))];
  return [tl, tr, br, bl];
};

const warpDocument = (cv: OpenCv, mat: CvMat, points: { x: number; y: number }[]) => {
  const [tl, tr, br, bl] = orderPoints(points);
  const widthA = Math.hypot(br.x - bl.x, br.y - bl.y);
  const widthB = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const heightA = Math.hypot(tr.x - br.x, tr.y - br.y);
  const heightB = Math.hypot(tl.x - bl.x, tl.y - bl.y);
  const maxWidth = Math.max(Math.round(widthA), Math.round(widthB));
  const maxHeight = Math.max(Math.round(heightA), Math.round(heightB));

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    tl.x,
    tl.y,
    tr.x,
    tr.y,
    br.x,
    br.y,
    bl.x,
    bl.y,
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0,
    0,
    maxWidth - 1,
    0,
    maxWidth - 1,
    maxHeight - 1,
    0,
    maxHeight - 1,
  ]);
  const transform = cv.getPerspectiveTransform(srcTri, dstTri);
  const warped = new cv.Mat();
  cv.warpPerspective(mat, warped, transform, new cv.Size(maxWidth, maxHeight));

  srcTri.delete();
  dstTri.delete();
  transform.delete();

  return warped;
};

const preprocessImage = async (inputBuffer: Buffer): Promise<PreprocessResult> => {
  const sharp = await loadSharp();
  let cv: OpenCv | null = null;
  let cvErrorNote: string | null = null;
  try {
    cv = await loadOpenCv(5000);
  } catch (error) {
    cvErrorNote = error instanceof Error ? error.message : "OpenCV 초기화 실패";
    console.warn("Skipping OpenCV features:", cvErrorNote);
  }

  const base = sharp(inputBuffer).rotate();
  const rotatedBuffer = await base.clone().png().toBuffer();
  const { data: fullRaw, info: fullInfo } = await base.clone().raw().toBuffer({ resolveWithObject: true });

  const maxDim = Math.max(fullInfo.width, fullInfo.height);
  const scale = maxDim > 1000 ? 1000 / maxDim : 1;
  const { data: smallRaw, info: smallInfo } = await base
    .clone()
    .resize({
      width: Math.round(fullInfo.width * scale),
      height: Math.round(fullInfo.height * scale),
      fit: "inside",
    })
    .raw()
    .toBuffer({ resolveWithObject: true });

  let docDetected = false;
  let note: string | null = null;
  let scanBuffer = rotatedBuffer;

  if (cv) {
    try {
      const smallMat = new cv.Mat(smallInfo.height, smallInfo.width, cv.CV_8UC4);
      smallMat.data.set(smallRaw);
      const points = detectDocumentCorners(cv, smallMat);
      smallMat.delete();

      if (points) {
        const scaled = points.map((pt) => ({
          x: pt.x / scale,
          y: pt.y / scale,
        }));
        const fullMat = new cv.Mat(fullInfo.height, fullInfo.width, cv.CV_8UC4);
        fullMat.data.set(fullRaw);
        const warped = warpDocument(cv, fullMat, scaled);
        fullMat.delete();

        const channels = warped.channels();
        const pngBuffer = await sharp(Buffer.from(warped.data), {
          raw: {
            width: warped.cols,
            height: warped.rows,
            channels: channels as any,
          },
        })
          .png()
          .toBuffer();
        warped.delete();
        scanBuffer = pngBuffer;
        docDetected = true;
      } else {
        note = "문서 윤곽선을 찾지 못했습니다.";
      }
    } catch (error) {
      note = error instanceof Error ? error.message : "문서 감지 중 오류가 발생했습니다.";
    }
  } else {
    note = cvErrorNote ?? "문서 감지 라이브러리를 사용할 수 없습니다.";
  }

  const trackABuffer = await sharp(scanBuffer)
    .modulate({ brightness: 1.03, saturation: 1.05 })
    .median(1)
    .sharpen()
    .png()
    .toBuffer();

  let trackBBuffer = trackABuffer;
  if (cv) {
    try {
      const { data: raw, info } = await sharp(scanBuffer).raw().toBuffer({ resolveWithObject: true });
      const mat = new cv.Mat(info.height, info.width, cv.CV_8UC4);
      mat.data.set(raw);
      const gray = new cv.Mat();
      const denoise = new cv.Mat();
      const thresh = new cv.Mat();
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);
      cv.bilateralFilter(gray, denoise, 9, 75, 75);
      cv.adaptiveThreshold(denoise, thresh, 255, cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 35, 10);

      const pngBuffer = await sharp(Buffer.from(thresh.data), {
        raw: {
          width: thresh.cols,
          height: thresh.rows,
          channels: 1,
        },
      })
        .png()
        .toBuffer();

      trackBBuffer = pngBuffer;
      mat.delete();
      gray.delete();
      denoise.delete();
      thresh.delete();
    } catch {
      trackBBuffer = await sharp(scanBuffer).grayscale().normalize().threshold(180).png().toBuffer();
    }
  } else {
    trackBBuffer = await sharp(scanBuffer).grayscale().normalize().threshold(180).png().toBuffer();
  }

  return {
    scanBuffer,
    trackABuffer,
    trackBBuffer,
    docDetected,
    note,
  };
};

const uploadToStorage = async (path: string, buffer: Buffer, contentType = "image/png") => {
  const { error } = await supabaseAdmin.storage.from(BUCKET).upload(path, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw new Error(error.message);
};

export const processUtilityBill = async (billId: string) => {
  if (!supabaseAdmin) {
    throw new Error("Supabase admin client is not configured.");
  }

  const { data: bill, error } = await supabaseAdmin
    .from("utility_bills")
    .select("*")
    .eq("id", billId)
    .single();

  if (error || !bill) {
    throw new Error(error?.message ?? "Utility bill not found.");
  }

  if (bill.status !== "PROCESSING") {
    return;
  }

  const updateBill = async (payload: Record<string, unknown>) => {
    await supabaseAdmin
      .from("utility_bills")
      .update({ ...payload, updated_at: nowIso() })
      .eq("id", billId);
  };

  try {
    await updateBill({ processing_stage: "DOWNLOAD", last_error_code: null, last_error_message: null });

    const { data: originalBlob, error: downloadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .download(bill.file_url);
    if (downloadError || !originalBlob) {
      throw new Error(downloadError?.message ?? "원본 이미지를 다운로드하지 못했습니다.");
    }
    const originalBuffer = Buffer.from(await originalBlob.arrayBuffer());

    await updateBill({ processing_stage: "PREPROCESS_CV" });
    const preprocess = await preprocessImage(originalBuffer);

    await updateBill({ processing_stage: "PREPROCESS_UPLOAD" });
    const scanPath = `${bill.company_id}/${billId}/processed/scan.png`;
    const trackAPath = `${bill.company_id}/${billId}/processed/trackA.png`;
    const trackBPath = `${bill.company_id}/${billId}/processed/trackB.png`;

    await uploadToStorage(scanPath, preprocess.scanBuffer);
    await uploadToStorage(trackAPath, preprocess.trackABuffer);
    await uploadToStorage(trackBPath, preprocess.trackBBuffer);

    await updateBill({
      processed_file_url: scanPath,
      processing_stage: "TEMPLATE_OCR",
    });

    const endpoints = buildClovaEndpoints();
    const templateIds = buildTemplateIds();
    let ocrMode: "TEMPLATE" | "GENERAL" = "GENERAL";
    let templateUsed: string | null = null;
    let ocrResult: OcrResult | null = null;
    let templateFields: ClovaField[] | null = null;

    if (endpoints.template) {
      try {
        const templateOcr = await callClovaOcr(endpoints.template, preprocess.trackABuffer, templateIds);
        if (templateOcr.text.length > 30 || templateOcr.fieldsCount >= 4) {
          ocrMode = "TEMPLATE";
          ocrResult = templateOcr;
          templateFields = extractOcrText(templateOcr.raw).rawFields;
          templateUsed = templateIds[0] ?? null;
        }
      } catch (error) {
        await updateBill({
          processing_stage: "GENERAL_OCR",
          last_error_code: "TEMPLATE_OCR_FAILED",
          last_error_message: error instanceof Error ? error.message : "템플릿 OCR 실패",
        });
      }
    }

    if (!ocrResult) {
      await updateBill({ processing_stage: "GENERAL_OCR" });
      if (!endpoints.general) {
        throw new Error("CLOVA OCR general endpoint is missing.");
      }
      const generalOcr = await callClovaOcr(endpoints.general, preprocess.trackBBuffer);
      ocrMode = "GENERAL";
      ocrResult = generalOcr;
    }

    await updateBill({
      raw_ocr_text: ocrResult.text || null,
      ocr_mode: ocrMode,
      template_id: templateUsed,
      processing_stage: "GEMINI",
    });

    const llm = await callOpenRouter(ocrResult.text, templateFields);

    await updateBill({ processing_stage: "VALIDATE" });

    const { normalized, status } = evaluateResult(llm, preprocess.docDetected, ocrResult.text);

    await updateBill({
      vendor_name: normalized.vendor_name,
      bill_type: normalized.bill_type,
      amount_due: normalized.amount_due,
      due_date: normalized.due_date,
      billing_period_start: normalized.billing_period_start,
      billing_period_end: normalized.billing_period_end,
      customer_no: normalized.customer_no,
      payment_account: normalized.payment_account,
      confidence: normalized.confidence,
      status,
      extracted_json: {
        ...normalized,
        ocr_mode: ocrMode,
        template_id: templateUsed,
        preprocess: {
          doc_detected: preprocess.docDetected,
          note: preprocess.note,
        },
      },
      processing_stage: "DONE",
      last_error_code: preprocess.docDetected ? null : "DOC_DETECT_FAILED",
      last_error_message: preprocess.note,
    });
  } catch (error) {
    await supabaseAdmin
      .from("utility_bills")
      .update({
        status: "NEEDS_REVIEW",
        processing_stage: "DONE",
        last_error_code: "PIPELINE_FAILED",
        last_error_message: error instanceof Error ? error.message : "처리 중 오류가 발생했습니다.",
        updated_at: nowIso(),
      })
      .eq("id", billId);
  }
};

export const triggerUtilityBillProcessing = (billId: string) => {
  // Attempt to trigger via external API call for better reliability in serverless environments
  const siteUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_SITE_URL;
  if (siteUrl) {
    const protocol = siteUrl.includes("localhost") ? "http" : "https";
    const baseUrl = siteUrl.startsWith("http") ? siteUrl : `${protocol}://${siteUrl}`;
    const secret = process.env.CRON_SECRET || "";
    void fetch(`${baseUrl}/api/utility-bills/process?id=${billId}&cron_secret=${secret}`).catch(() => { });
  }

  // Local/Development fallback
  setTimeout(() => {
    void processUtilityBill(billId).catch(() => { });
  }, 100);
};

export const buildUtilityBillPaths = (companyId: string, billId: string) => ({
  scan: `${companyId}/${billId}/processed/scan.png`,
  trackA: `${companyId}/${billId}/processed/trackA.png`,
  trackB: `${companyId}/${billId}/processed/trackB.png`,
});

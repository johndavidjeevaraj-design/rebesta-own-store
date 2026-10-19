/* Next-bundled client auth controller. The legacy /js/auth.js remains available
   only to legacy Vite fallbacks; Next login and checkout import this module. */

type WidgetCallback = (value?: unknown) => void;

interface Msg91Window extends Window {
  initSendOTP?: (config: Record<string, unknown>) => void;
  sendOtp?: (phone: string, success: WidgetCallback, failure: WidgetCallback) => void;
  retryOtp?: (channel: string | null, success: WidgetCallback, failure: WidgetCallback) => void;
  verifyOtp?: (code: string, success: WidgetCallback, failure: WidgetCallback) => void;
  isCaptchaVerified?: () => boolean;
  __otpWidgetSuccess?: unknown;
  __otpWidgetFailure?: unknown;
}

export interface AuthCustomer {
  name?: string;
  phone?: string;
  email?: string;
  createdAt?: string;
  phoneVerified?: boolean;
}

interface OtpResponse {
  customer?: AuthCustomer | null;
  isNew?: boolean;
  verifiedToken?: string;
}

interface AuthApiResponse extends OtpResponse {
  ok?: boolean;
  error?: string;
  [key: string]: unknown;
}

const OTP_SOURCES = [
  "https://verify.msg91.com/otp-provider.js",
  "https://verify.phone91.com/otp-provider.js",
];
const OTP_CONFIG: Record<string, unknown> = {
  widgetId: "366a65687644323637363131",
  tokenAuth: "571380TgZrH8gvzsiK6aa8dedbP1",
  exposeMethods: true,
  success: (data: unknown) => {
    (window as Msg91Window).__otpWidgetSuccess = data;
  },
  failure: (error: unknown) => {
    (window as Msg91Window).__otpWidgetFailure = error;
  },
};

let otpLoadPromise: Promise<boolean> | null = null;
let otpInitialized = false;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

async function waitForWidgetMethods(w: Msg91Window): Promise<boolean> {
  for (let i = 0; i < 25; i += 1) {
    if (typeof w.sendOtp === "function" && typeof w.verifyOtp === "function") return true;
    await wait(100);
  }
  return false;
}

async function initializeWidget(w: Msg91Window): Promise<boolean> {
  if (typeof w.sendOtp === "function" && typeof w.verifyOtp === "function") return true;
  if (typeof w.initSendOTP !== "function") return false;
  try {
    if (!otpInitialized) {
      w.initSendOTP(OTP_CONFIG);
      otpInitialized = true;
    }
  } catch (error) {
    w.__otpWidgetFailure = error;
    return false;
  }
  return waitForWidgetMethods(w);
}

/** Load and initialize MSG91 once for the Next login page and cart sheet. */
export function loadOtpWidget(): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);
  const w = window as Msg91Window;
  if (typeof w.sendOtp === "function" && typeof w.verifyOtp === "function") return Promise.resolve(true);
  if (otpLoadPromise) return otpLoadPromise;

  const task = new Promise<boolean>((resolve) => {
    const initialize = () => {
      void initializeWidget(w).then(resolve).catch(() => resolve(false));
    };

    const existing = document.querySelector<HTMLScriptElement>("script[data-rfs-otp-sdk]");
    if (existing) {
      if (existing.dataset.state === "loaded" || typeof w.initSendOTP === "function") {
        initialize();
      } else if (existing.dataset.state === "loading") {
        existing.addEventListener("load", initialize, { once: true });
        existing.addEventListener("error", () => loadSource(1), { once: true });
      } else {
        loadSource(0);
      }
      return;
    }

    loadSource(0);

    function loadSource(index: number) {
      if (index >= OTP_SOURCES.length) {
        resolve(false);
        return;
      }
      const script = document.createElement("script");
      script.src = OTP_SOURCES[index];
      script.async = true;
      script.dataset.rfsOtpSdk = "1";
      script.dataset.state = "loading";
      script.onload = () => {
        script.dataset.state = "loaded";
        initialize();
      };
      script.onerror = () => {
        script.dataset.state = "failed";
        loadSource(index + 1);
      };
      document.head.appendChild(script);
    }
  });

  otpLoadPromise = task;
  void task.then((ready) => {
    if (!ready && otpLoadPromise === task) otpLoadPromise = null;
  });
  return task;
}

export async function postAuth(url: string, body: Record<string, unknown>, attempt = 0): Promise<AuthApiResponse> {
  let response: Response | null = null;
  let data: unknown = null;
  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
    data = await response.json().catch(() => null);
  } catch {
    data = null;
  }
  if (data == null && attempt < 1) {
    await wait(1300);
    return postAuth(url, body, attempt + 1);
  }
  if (data == null) throw new Error("Connection problem — please check your internet and try again.");
  const result = typeof data === "object" && !Array.isArray(data)
    ? data as AuthApiResponse
    : {};
  if (!response?.ok || !result.ok) throw new Error(result.error || "Something went wrong. Please try again.");
  return result;
}

export function prettyPhone(phone: string): string {
  return phone ? `+91 ${phone.slice(0, 5)} ${phone.slice(5)}` : "";
}

function extractToken(data: unknown, depth = 0): string | null {
  if (data == null || depth > 4) return null;
  if (typeof data === "string") return data.startsWith("eyJ") && data.includes(".") ? data : null;
  if (typeof data !== "object") return null;
  const record = data as Record<string, unknown>;
  for (const key of ["token", "accessToken", "access_token", "jwt", "access-token"]) {
    const value = record[key];
    if (typeof value === "string" && value.startsWith("eyJ")) return value;
  }
  for (const value of Object.values(record)) {
    const found = extractToken(value, depth + 1);
    if (found) return found;
  }
  return null;
}

function widgetError(error: unknown): string {
  const e = error as { message?: string; error?: string; msg?: string } | string | null;
  const raw = (e && typeof e === "object" && (e.message || e.error || e.msg)) || (typeof e === "string" ? e : "");
  const text = String(raw).toLowerCase();
  if (/ip/.test(text) && /block|black|ban/.test(text)) {
    return "Our SMS partner has temporarily blocked this network (too many code requests from it). Please wait about an hour, or use password sign-in / WhatsApp us.";
  }
  if (/throttle|too many|limit/.test(text)) return "Too many codes requested from this network — please wait a while and try again.";
  if (/wallet|balance|credit/.test(text)) return "The SMS service is briefly unavailable — we have been notified. Please try again shortly.";
  return String(raw) || "The SMS service did not respond — please try again in a moment.";
}

function verifyWidgetCode(code: string): Promise<string> {
  const w = window as Msg91Window;
  return new Promise((resolve, reject) => {
    if (typeof w.verifyOtp !== "function") {
      reject(new Error("OTP system is still loading — wait a few seconds and try again."));
      return;
    }
    try {
      w.verifyOtp(
        code,
        (data) => {
          const token = extractToken(data);
          if (token) resolve(token);
          else reject(new Error("Verification response was incomplete — please try again."));
        },
        (error) => reject(new Error(widgetError(error)))
      );
    } catch (error) {
      reject(new Error(widgetError(error)));
    }
  });
}

function createOtpInputs(container: HTMLElement, signal: AbortSignal) {
  const inputs: HTMLInputElement[] = Array.from({ length: 4 }, (_, index) => {
    const input = document.createElement("input");
    input.type = "text";
    input.inputMode = "numeric";
    input.autocomplete = index === 0 ? "one-time-code" : "off";
    input.maxLength = 1;
    input.className = "otp-box";
    input.setAttribute("aria-label", `digit ${index + 1}`);
    return input;
  });
  container.replaceChildren(...inputs);
  container.dataset.count = String(inputs.length);

  const refresh = () => inputs.forEach((input) => input.classList.toggle("filled", Boolean(input.value)));
  const value = () => inputs.map((input) => input.value).join("").replace(/\D/g, "");
  const fill = (code: string) => {
    const digits = String(code || "").replace(/\D/g, "").slice(0, inputs.length);
    inputs.forEach((input, index) => { input.value = digits[index] || ""; });
    refresh();
  };
  const focus = () => (inputs.find((input) => !input.value) || inputs[0])?.focus();

  container.addEventListener("input", (event) => {
    const input = event.target as HTMLInputElement;
    const index = inputs.indexOf(input);
    if (index < 0) return;
    input.value = input.value.replace(/\D/g, "").slice(-1);
    if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
    refresh();
  }, { signal });
  container.addEventListener("keydown", (event) => {
    const keyboard = event as KeyboardEvent;
    const input = keyboard.target as HTMLInputElement;
    const index = inputs.indexOf(input);
    if (index < 0) return;
    if (keyboard.key === "Backspace" && !input.value && index > 0) {
      keyboard.preventDefault();
      inputs[index - 1].value = "";
      inputs[index - 1].focus();
      refresh();
    } else if (keyboard.key === "ArrowLeft" && index > 0) inputs[index - 1].focus();
    else if (keyboard.key === "ArrowRight" && index < inputs.length - 1) inputs[index + 1].focus();
  }, { signal });
  container.addEventListener("paste", (event) => {
    const clipboard = event as ClipboardEvent;
    clipboard.preventDefault();
    fill(clipboard.clipboardData?.getData("text") || "");
    focus();
  }, { signal });

  return {
    value,
    fill,
    focus,
    destroy: () => container.replaceChildren(),
  };
}

function isCaptchaReady(root: ParentNode): boolean {
  const hasFrame = Boolean(root.querySelector("#otp-captcha iframe, #bp-captcha iframe") || document.querySelector("#otp-captcha iframe, #bp-captcha iframe"));
  const w = window as Msg91Window;
  return !hasFrame || typeof w.isCaptchaVerified !== "function" || w.isCaptchaVerified();
}

function showBusy(button: HTMLButtonElement | null, busy: boolean) {
  if (!button) return;
  button.classList.toggle("is-loading", busy);
  button.disabled = busy;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error || "Something went wrong. Please try again.");
}

function startResendCountdown(link: HTMLAnchorElement | null, seconds: number, currentTimer: { id: number | null }): void {
  if (!link) return;
  if (currentTimer.id !== null) window.clearInterval(currentTimer.id);
  link.style.pointerEvents = "none";
  link.setAttribute("aria-disabled", "true");
  let remaining = seconds;
  link.textContent = `Resend in ${remaining}s`;
  currentTimer.id = window.setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      if (currentTimer.id !== null) window.clearInterval(currentTimer.id);
      currentTimer.id = null;
      link.style.pointerEvents = "";
      link.removeAttribute("aria-disabled");
      link.textContent = "Resend code";
    } else {
      link.textContent = `Resend in ${remaining}s`;
    }
  }, 1000);
}

function clearResendCountdown(link: HTMLAnchorElement | null, timer: { id: number | null }): void {
  if (timer.id !== null) window.clearInterval(timer.id);
  timer.id = null;
  if (link) {
    link.style.pointerEvents = "";
    link.removeAttribute("aria-disabled");
    link.textContent = "Resend code";
  }
}

function displayError(box: HTMLElement | null, message: string): void {
  if (!box) return;
  box.textContent = message;
  box.hidden = false;
  box.classList.remove("shake");
  void box.offsetWidth;
  box.classList.add("shake");
}

function clearError(box: HTMLElement | null): void {
  if (box) box.hidden = true;
}

function changeStep(steps: Record<string, HTMLElement | null>, name: string): void {
  for (const [key, element] of Object.entries(steps)) {
    if (element) element.hidden = key !== name;
  }
  const current = steps[name];
  if (current) {
    current.classList.remove("in");
    void current.offsetWidth;
    current.classList.add("in");
  }
}

function checkWidgetCaptcha(root: ParentNode, box: HTMLElement | null): boolean {
  if (isCaptchaReady(root)) return true;
  displayError(box, "Please complete the security check first.");
  return false;
}

/** Attach the existing Next login page's data hooks to the auth APIs. */
export function bindLoginPage(root: HTMLElement): () => void {
  const abort = new AbortController();
  let disposed = false;
  let widgetPhone: string | null = null;
  let verifiedSignupToken: string | null = null;
  let otpReady = false;
  let currentStep = "number";
  let restartTimer: number | null = null;
  const resendTimer = { id: null as number | null };

  const otpForm = root.querySelector<HTMLFormElement>("[data-otp-form]");
  const passwordForm = root.querySelector<HTMLFormElement>("[data-login-form]");
  const errorBox = root.querySelector<HTMLElement>("[data-auth-error]");
  const success = root.querySelector<HTMLElement>("[data-auth-success]");
  const steps = {
    number: otpForm?.querySelector<HTMLElement>('[data-step="number"]') || null,
    code: otpForm?.querySelector<HTMLElement>('[data-step="code"]') || null,
    name: otpForm?.querySelector<HTMLElement>('[data-step="name"]') || null,
  };
  const phoneInput = otpForm?.querySelector<HTMLInputElement>("#otpPhone") || null;
  const sendButton = otpForm?.querySelector<HTMLButtonElement>("[data-otp-send]") || null;
  const verifyButton = otpForm?.querySelector<HTMLButtonElement>("[data-otp-verify]") || null;
  const createButton = otpForm?.querySelector<HTMLButtonElement>("[data-otp-create]") || null;
  const sentNote = otpForm?.querySelector<HTMLElement>("[data-otp-sentto]") || null;
  const newNote = otpForm?.querySelector<HTMLElement>("[data-otp-newto]") || null;
  const resendLink = otpForm?.querySelector<HTMLAnchorElement>("[data-otp-resend]") || null;
  const changeLink = otpForm?.querySelector<HTMLAnchorElement>("[data-otp-change]") || null;
  const restartLink = otpForm?.querySelector<HTMLAnchorElement>("[data-otp-restart]") || null;
  const boxesElement = otpForm?.querySelector<HTMLElement>("[data-otp-boxes]") || null;
  const boxes = boxesElement ? createOtpInputs(boxesElement, abort.signal) : null;
  const passwordToggle = root.querySelector<HTMLAnchorElement>("[data-pw-toggle]");
  const otpToggle = root.querySelector<HTMLAnchorElement>("[data-otp-toggle]");

  const usePasswordMode = (on: boolean) => {
    clearError(errorBox);
    if (otpForm) otpForm.hidden = on;
    if (passwordForm) passwordForm.hidden = !on;
    if (passwordToggle) passwordToggle.hidden = on || !otpReady;
    if (otpToggle) otpToggle.hidden = !on || !otpReady;
  };
  const showStep = (name: string) => {
    currentStep = name;
    changeStep(steps, name);
  };

  const prefill = new URLSearchParams(window.location.search).get("phone");
  if (prefill && /^\d{10}$/.test(prefill) && phoneInput) phoneInput.value = prefill;

  void loadOtpWidget();
  void fetch("/api/auth/me")
    .then((response) => response.json())
    .then((data) => { if (!disposed && data.customer) window.location.replace("/account"); })
    .catch(() => {});
  void fetch("/api/auth/otp/available")
    .then((response) => response.json())
    .then((data) => {
      if (disposed) return;
      otpReady = Boolean(data?.enabled && data?.mode === "widget");
      if (!otpReady) {
        usePasswordMode(true);
        if (passwordToggle) passwordToggle.hidden = true;
      }
    })
    .catch(() => {
      if (disposed) return;
      otpReady = false;
      usePasswordMode(true);
      if (passwordToggle) passwordToggle.hidden = true;
    });

  function restart(keepPhone: boolean) {
    if (restartTimer !== null) window.clearTimeout(restartTimer);
    restartTimer = null;
    clearResendCountdown(resendLink, resendTimer);
    widgetPhone = null;
    verifiedSignupToken = null;
    boxes?.fill("");
    const nameInput = otpForm?.querySelector<HTMLInputElement>("#newName");
    if (nameInput) nameInput.value = "";
    clearError(errorBox);
    showStep("number");
    if (!keepPhone && phoneInput) phoneInput.value = "";
    phoneInput?.focus();
  }

  function sendCode() {
    clearError(errorBox);
    const phone = (phoneInput?.value || "").replace(/\D/g, "");
    if (phone.length !== 10 || !/^[6-9]/.test(phone)) {
      displayError(errorBox, "Enter a valid 10-digit Indian mobile number.");
      return;
    }
    const w = window as Msg91Window;
    if (typeof w.sendOtp !== "function") {
      displayError(errorBox, "OTP system is still loading — wait a few seconds and try again.");
      return;
    }
    if (!checkWidgetCaptcha(root, errorBox)) return;
    showBusy(sendButton, true);
    try {
      w.sendOtp("91" + phone, () => {
        if (disposed) return;
        widgetPhone = phone;
        showBusy(sendButton, false);
        if (sentNote) sentNote.textContent = `Code sent to ${prettyPhone(phone)}`;
        showStep("code");
        boxes?.fill("");
        boxes?.focus();
        startResendCountdown(resendLink, 60, resendTimer);
      }, (error) => {
        if (disposed) return;
        displayError(errorBox, widgetError(error));
        showBusy(sendButton, false);
      });
    } catch (error) {
      displayError(errorBox, widgetError(error));
      showBusy(sendButton, false);
    }
  }

  async function verifyCode() {
    clearError(errorBox);
    const code = boxes?.value() || "";
    if (code.length < 4 || code.length > 8) {
      displayError(errorBox, "Enter the code from the SMS.");
      return;
    }
    if (!widgetPhone) {
      displayError(errorBox, "Please request a code first.");
      return;
    }
    showBusy(verifyButton, true);
    try {
      const token = await verifyWidgetCode(code);
      const result = (await postAuth("/api/auth/otp/widget", { phone: widgetPhone, token })) as OtpResponse;
      if (disposed) return;
      if (result.isNew) {
        verifiedSignupToken = result.verifiedToken || null;
        if (newNote) newNote.textContent = `${prettyPhone(widgetPhone)} verified`;
        showBusy(verifyButton, false);
        showStep("name");
        otpForm?.querySelector<HTMLInputElement>("#newName")?.focus();
      } else {
        await showLoginSuccess(success, "Welcome back!", "Signed in — taking you to your account…");
        if (!disposed) window.location.href = "/account";
      }
    } catch (error) {
      if (!disposed) {
        displayError(errorBox, errorText(error));
        showBusy(verifyButton, false);
      }
    }
  }

  async function createAccount() {
    clearError(errorBox);
    const name = (otpForm?.querySelector<HTMLInputElement>("#newName")?.value || "").trim();
    if (name.length < 2) {
      displayError(errorBox, "Please tell us your name.");
      return;
    }
    if (!verifiedSignupToken) {
      displayError(errorBox, "Please verify your number first.");
      return;
    }
    showBusy(createButton, true);
    try {
      await postAuth("/api/auth/otp/complete-signup", { name, verifiedToken: verifiedSignupToken });
      if (disposed) return;
      await showLoginSuccess(success, "Account created!", `Welcome to Rebesta Fresh, ${name.split(" ")[0]} 🌿`);
      if (!disposed) window.location.href = "/account";
    } catch (error) {
      if (!disposed) {
        displayError(errorBox, errorText(error));
        showBusy(createButton, false);
        if (/already has an account/i.test(errorText(error))) {
          restartTimer = window.setTimeout(() => restart(true), 1800);
        }
      }
    }
  }

  otpForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    if (currentStep === "number") sendCode();
    else if (currentStep === "code") void verifyCode();
    else if (currentStep === "name") void createAccount();
  }, { signal: abort.signal });

  passwordForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError(errorBox);
    const button = passwordForm.querySelector<HTMLButtonElement>("[data-login-submit]");
    showBusy(button, true);
    try {
      await postAuth("/api/auth/login", {
        phone: (passwordForm.querySelector<HTMLInputElement>("#loginPhone")?.value || "").replace(/\D/g, ""),
        password: passwordForm.querySelector<HTMLInputElement>("#loginPassword")?.value || "",
      });
      if (disposed) return;
      await showLoginSuccess(success, "Welcome back!", "Signed in — taking you to your account…");
      if (!disposed) window.location.href = "/account";
    } catch (error) {
      if (!disposed) {
        displayError(errorBox, errorText(error));
        showBusy(button, false);
      }
    }
  }, { signal: abort.signal });

  passwordToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    usePasswordMode(true);
  }, { signal: abort.signal });
  otpToggle?.addEventListener("click", (event) => {
    event.preventDefault();
    usePasswordMode(false);
  }, { signal: abort.signal });
  changeLink?.addEventListener("click", (event) => {
    event.preventDefault();
    restart(false);
  }, { signal: abort.signal });
  restartLink?.addEventListener("click", (event) => {
    event.preventDefault();
    restart(false);
  }, { signal: abort.signal });
  resendLink?.addEventListener("click", (event) => {
    event.preventDefault();
    if (resendTimer.id !== null) return;
    clearError(errorBox);
    const w = window as Msg91Window;
    if (typeof w.retryOtp !== "function" || !widgetPhone) {
      displayError(errorBox, "Please request a code first.");
      return;
    }
    try {
      w.retryOtp(null, () => startResendCountdown(resendLink, 60, resendTimer), (error) => displayError(errorBox, widgetError(error)));
    } catch (error) {
      displayError(errorBox, widgetError(error));
    }
  }, { signal: abort.signal });
  root.addEventListener("click", (event) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>("[data-eye]") : null;
    if (!target || !root.contains(target)) return;
    const input = root.querySelector<HTMLInputElement>(`#${CSS.escape(target.dataset.eye || "")}`);
    if (!input) return;
    const reveal = input.type === "password";
    input.type = reveal ? "text" : "password";
    target.classList.toggle("revealed", reveal);
  }, { signal: abort.signal });

  return () => {
    disposed = true;
    abort.abort();
    if (restartTimer !== null) window.clearTimeout(restartTimer);
    clearResendCountdown(resendLink, resendTimer);
    boxes?.destroy();
  };
}

async function showLoginSuccess(success: HTMLElement | null, title: string, subtitle: string): Promise<void> {
  if (!success) return;
  const titleNode = success.querySelector<HTMLElement>("[data-success-title]");
  const subtitleNode = success.querySelector<HTMLElement>("[data-success-sub]");
  if (titleNode) titleNode.textContent = title;
  if (subtitleNode) subtitleNode.textContent = subtitle;
  const confetti = success.querySelector<HTMLElement>(".as-confetti");
  if (confetti && !confetti.childElementCount) {
    const colors = ["#0d8736", "#0faa46", "#ff8b3d", "#ffd582", "#e23a2e"];
    for (let i = 0; i < 14; i += 1) {
      const particle = document.createElement("i");
      const angle = (Math.PI * 2 * i) / 14 + Math.random() * 0.5;
      const distance = 70 + Math.random() * 55;
      particle.style.setProperty("--tx", `${Math.cos(angle) * distance}px`);
      particle.style.setProperty("--ty", `${Math.sin(angle) * distance - 30}px`);
      particle.style.setProperty("--rot", `${Math.round(Math.random() * 500 - 250)}deg`);
      particle.style.setProperty("--cf", colors[i % colors.length]);
      particle.style.animationDelay = `${(0.6 + Math.random() * 0.25).toFixed(2)}s`;
      confetti.appendChild(particle);
    }
  }
  success.classList.add("show");
  await wait(1100);
}

export function bindCheckoutAuthFlow(
  root: HTMLFormElement,
  options: { onSuccess?: (customer: AuthCustomer | null) => void | Promise<void> } = {}
): () => void {
  const abort = new AbortController();
  let disposed = false;
  let widgetPhone: string | null = null;
  let verifiedSignupToken: string | null = null;
  let currentStep = "number";
  const resendTimer = { id: null as number | null };
  const steps = {
    number: root.querySelector<HTMLElement>('[data-step="number"]'),
    code: root.querySelector<HTMLElement>('[data-step="code"]'),
    name: root.querySelector<HTMLElement>('[data-step="name"]'),
  };
  const phoneInput = root.querySelector<HTMLInputElement>("[data-flow-phone]");
  const nameInput = root.querySelector<HTMLInputElement>("[data-flow-name]");
  const sendButton = root.querySelector<HTMLButtonElement>("[data-flow-send]");
  const verifyButton = root.querySelector<HTMLButtonElement>("[data-flow-verify]");
  const createButton = root.querySelector<HTMLButtonElement>("[data-flow-create]");
  const sentNote = root.querySelector<HTMLElement>("[data-flow-sentto]");
  const newNote = root.querySelector<HTMLElement>("[data-flow-newto]");
  const resendLink = root.querySelector<HTMLAnchorElement>("[data-flow-resend]");
  const changeLink = root.querySelector<HTMLAnchorElement>("[data-flow-change]");
  const restartLink = root.querySelector<HTMLAnchorElement>("[data-flow-restart]");
  const errorBox = root.querySelector<HTMLElement>("[data-flow-error]");
  const boxesElement = root.querySelector<HTMLElement>("[data-flow-boxes]");
  const boxes = boxesElement ? createOtpInputs(boxesElement, abort.signal) : null;

  void loadOtpWidget();
  const showStep = (name: string) => {
    currentStep = name;
    changeStep(steps, name);
  };
  const restart = () => {
    clearResendCountdown(resendLink, resendTimer);
    widgetPhone = null;
    verifiedSignupToken = null;
    boxes?.fill("");
    if (nameInput) nameInput.value = "";
    clearError(errorBox);
    showStep("number");
    phoneInput?.focus();
  };

  function sendCode() {
    clearError(errorBox);
    const phone = (phoneInput?.value || "").replace(/\D/g, "");
    if (phone.length !== 10 || !/^[6-9]/.test(phone)) {
      displayError(errorBox, "Enter a valid 10-digit Indian mobile number.");
      return;
    }
    const w = window as Msg91Window;
    if (typeof w.sendOtp !== "function") {
      displayError(errorBox, "OTP system is still loading — wait a few seconds and try again.");
      return;
    }
    if (!checkWidgetCaptcha(root, errorBox)) return;
    showBusy(sendButton, true);
    try {
      w.sendOtp("91" + phone, () => {
        if (disposed) return;
        widgetPhone = phone;
        showBusy(sendButton, false);
        if (sentNote) sentNote.textContent = `Code sent to ${prettyPhone(phone)}`;
        showStep("code");
        boxes?.fill("");
        boxes?.focus();
        startResendCountdown(resendLink, 60, resendTimer);
      }, (error) => {
        if (disposed) return;
        displayError(errorBox, widgetError(error));
        showBusy(sendButton, false);
      });
    } catch (error) {
      displayError(errorBox, widgetError(error));
      showBusy(sendButton, false);
    }
  }

  async function verifyCode() {
    clearError(errorBox);
    const code = boxes?.value() || "";
    if (code.length < 4 || code.length > 8) {
      displayError(errorBox, "Enter the code from the SMS.");
      return;
    }
    if (!widgetPhone) {
      displayError(errorBox, "Please request a code first.");
      return;
    }
    showBusy(verifyButton, true);
    try {
      const token = await verifyWidgetCode(code);
      const result = (await postAuth("/api/auth/otp/widget", { phone: widgetPhone, token })) as OtpResponse;
      if (disposed) return;
      if (result.isNew) {
        verifiedSignupToken = result.verifiedToken || null;
        if (newNote) newNote.textContent = `${prettyPhone(widgetPhone)} verified`;
        showBusy(verifyButton, false);
        showStep("name");
        nameInput?.focus();
      } else if (options.onSuccess) {
        await options.onSuccess(result.customer || null);
      }
    } catch (error) {
      if (!disposed) {
        displayError(errorBox, errorText(error));
        showBusy(verifyButton, false);
      }
    }
  }

  async function createAccount() {
    clearError(errorBox);
    const name = (nameInput?.value || "").trim();
    if (name.length < 2) {
      displayError(errorBox, "Please tell us your name.");
      return;
    }
    if (!verifiedSignupToken) {
      displayError(errorBox, "Please verify your number first.");
      return;
    }
    showBusy(createButton, true);
    try {
      const result = (await postAuth("/api/auth/otp/complete-signup", { name, verifiedToken: verifiedSignupToken })) as OtpResponse;
      if (!disposed && options.onSuccess) await options.onSuccess(result.customer || null);
    } catch (error) {
      if (!disposed) {
        displayError(errorBox, errorText(error));
        showBusy(createButton, false);
        if (/already has an account/i.test(errorText(error))) window.setTimeout(restart, 1800);
      }
    }
  }

  sendButton?.addEventListener("click", sendCode, { signal: abort.signal });
  root.addEventListener("submit", (event) => {
    event.preventDefault();
    if (currentStep === "number") sendCode();
    else if (currentStep === "code") void verifyCode();
    else if (currentStep === "name") void createAccount();
  }, { signal: abort.signal });
  resendLink?.addEventListener("click", (event) => {
    event.preventDefault();
    if (resendTimer.id !== null) return;
    clearError(errorBox);
    const w = window as Msg91Window;
    if (typeof w.retryOtp !== "function" || !widgetPhone) {
      displayError(errorBox, "Please request a code first.");
      return;
    }
    try {
      w.retryOtp(null, () => startResendCountdown(resendLink, 60, resendTimer), (error) => displayError(errorBox, widgetError(error)));
    } catch (error) {
      displayError(errorBox, widgetError(error));
    }
  }, { signal: abort.signal });
  changeLink?.addEventListener("click", (event) => { event.preventDefault(); restart(); }, { signal: abort.signal });
  restartLink?.addEventListener("click", (event) => { event.preventDefault(); restart(); }, { signal: abort.signal });

  return () => {
    disposed = true;
    abort.abort();
    clearResendCountdown(resendLink, resendTimer);
    boxes?.destroy();
  };
}

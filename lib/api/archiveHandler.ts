import { LaunchOptions, chromium, devices } from "playwright";
import { prisma } from "./db";
import sendToWayback from "./preservationScheme/sendToWayback";
import { AiTaggingMethod } from "@prisma/client";
import fetchHeaders from "./fetchHeaders";
import createFolder from "./storage/createFolder";
import { removeFiles } from "./manageLinkFiles";
import handleMonolith from "./preservationScheme/handleMonolith";
import handleReadability from "./preservationScheme/handleReadability";
import handleArchivePreview from "./preservationScheme/handleArchivePreview";
import handleScreenshotAndPdf from "./preservationScheme/handleScreenshotAndPdf";
import imageHandler from "./preservationScheme/imageHandler";
import pdfHandler from "./preservationScheme/pdfHandler";
import autoTagLink from "./autoTagLink";
import { LinkWithCollectionOwnerAndTags } from "../../types/global";
import isArchivalTag from "../shared/isArchivalTag";

const BROWSER_TIMEOUT = Number(process.env.BROWSER_TIMEOUT) || 5;

export interface ArchivalSettings {
  archiveAsScreenshot: boolean;
  archiveAsMonolith: boolean;
  archiveAsPDF: boolean;
  archiveAsReadable: boolean;
  archiveAsWaybackMachine: boolean;
  aiTag: boolean;
}

export default async function archiveHandler(
  link: LinkWithCollectionOwnerAndTags
) {
  const user = link.collection?.owner;

  if (process.env.DISABLE_PRESERVATION === "true") {
    await prisma.link.update({
      where: { id: link.id },
      data: {
        lastPreserved: new Date().toISOString(),
        readable: "unavailable",
        image: "unavailable",
        monolith: "unavailable",
        pdf: "unavailable",
        preview: "unavailable",

        // To prevent re-archiving the same link
        aiTagged:
          user.aiTaggingMethod !== AiTaggingMethod.DISABLED &&
          !link.aiTagged &&
          (process.env.NEXT_PUBLIC_OLLAMA_ENDPOINT_URL ||
            process.env.OPENAI_API_KEY ||
            process.env.AZURE_API_KEY ||
            process.env.ANTHROPIC_API_KEY)
            ? true
            : undefined,
      },
    });

    return;
  }

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(
      () =>
        reject(
          new Error(
            `Browser has been open for more than ${BROWSER_TIMEOUT} minutes.`
          )
        ),
      BROWSER_TIMEOUT * 60000
    );
  });

  const browserOptions = getBrowserOptions();

  const browser = await chromium.launch(browserOptions);
  const context = await browser.newContext({
    ...devices["Desktop Chrome"],
    ignoreHTTPSErrors: process.env.IGNORE_HTTPS_ERRORS === "true",
  });

  const page = await context.newPage();

  createFolder({ filePath: `archives/preview/${link.collectionId}` });
  createFolder({ filePath: `archives/${link.collectionId}` });

  const archivalTags = link.tags.filter(isArchivalTag);

  const archivalSettings: ArchivalSettings =
    archivalTags.length > 0
      ? {
          archiveAsScreenshot: archivalTags.some(
            (tag) => tag.archiveAsScreenshot
          ),
          archiveAsMonolith: archivalTags.some((tag) => tag.archiveAsMonolith),
          archiveAsPDF: archivalTags.some((tag) => tag.archiveAsPDF),
          archiveAsReadable: archivalTags.some((tag) => tag.archiveAsReadable),
          archiveAsWaybackMachine: archivalTags.some(
            (tag) => tag.archiveAsWaybackMachine
          ),
          aiTag: archivalTags.some((tag) => tag.aiTag),
        }
      : {
          archiveAsScreenshot: user.archiveAsScreenshot,
          archiveAsMonolith: user.archiveAsMonolith,
          archiveAsPDF: user.archiveAsPDF,
          archiveAsReadable: user.archiveAsReadable,
          archiveAsWaybackMachine: user.archiveAsWaybackMachine,
          aiTag: user.aiTaggingMethod !== AiTaggingMethod.DISABLED,
        };

  try {
    await Promise.race([
      (async () => {
        const { linkType, imageExtension } = await determineLinkType(
          link.id,
          link.url
        );

        // send to archive.org
        if (archivalSettings.archiveAsWaybackMachine && link.url)
          sendToWayback(link.url);

        if (linkType === "image" && !link.image) {
          await imageHandler(link, imageExtension); // archive image (jpeg/png)
          return;
        } else if (linkType === "pdf" && !link.pdf) {
          await pdfHandler(link); // archive pdf
          return;
        } else if (link.url) {
          // archive url

          await page.goto(link.url, { waitUntil: "domcontentloaded" });

          const metaDescription = await page.evaluate(() => {
            const description = document.querySelector(
              'meta[name="description"]'
            );
            return description?.getAttribute("content") ?? undefined;
          });

          const content = await page.content();

          // Preview
          if (!link.preview) await handleArchivePreview(link, page);

          // Readability
          if (archivalSettings.archiveAsReadable && !link.readable)
            await handleReadability(content, link);

          // Auto-tagging
          if (
            archivalSettings.aiTag &&
            user.aiTaggingMethod !== AiTaggingMethod.DISABLED &&
            !link.aiTagged &&
            (process.env.NEXT_PUBLIC_OLLAMA_ENDPOINT_URL ||
              process.env.OPENAI_API_KEY ||
              process.env.AZURE_API_KEY ||
              process.env.ANTHROPIC_API_KEY)
          )
            await autoTagLink(user, link.id, metaDescription);

          // Screenshot/PDF
          if (
            (archivalSettings.archiveAsScreenshot && !link.image) ||
            (archivalSettings.archiveAsPDF && !link.pdf)
          )
            await handleScreenshotAndPdf(link, page, archivalSettings);

          // Monolith
          if (archivalSettings.archiveAsMonolith && !link.monolith && link.url)
            await handleMonolith(link, content);
        }
      })(),
      timeoutPromise,
    ]);
  } catch (err) {
    console.log(err);
    console.log("Failed Link details:", link);
    throw err;
  } finally {
    const finalLink = await prisma.link.findUnique({
      where: { id: link.id },
    });

    console.log(finalLink);

    if (finalLink)
      await prisma.link.update({
        where: { id: link.id },
        data: {
          lastPreserved: new Date().toISOString(),
          readable: !finalLink.readable ? "unavailable" : undefined,
          image: !finalLink.image ? "unavailable" : undefined,
          monolith: !finalLink.monolith ? "unavailable" : undefined,
          pdf: !finalLink.pdf ? "unavailable" : undefined,
          preview: !finalLink.preview ? "unavailable" : undefined,
          aiTagged:
            user.aiTaggingMethod !== AiTaggingMethod.DISABLED &&
            !finalLink.aiTagged
              ? true
              : undefined,
        },
      });
    else {
      await removeFiles(link.id, link.collectionId);
    }

    await browser.close();
  }
}

// Determine the type of the link based on its content-type header.
async function determineLinkType(
  linkId: number,
  url?: string | null
): Promise<{
  linkType: "url" | "pdf" | "image";
  imageExtension: "png" | "jpeg";
}> {
  let linkType: "url" | "pdf" | "image" = "url";
  let imageExtension: "png" | "jpeg" = "png";

  if (!url) return { linkType: "url", imageExtension };

  const headers = await fetchHeaders(url);
  const contentType = headers?.get("content-type");

  if (contentType?.includes("application/pdf")) {
    linkType = "pdf";
  } else if (contentType?.startsWith("image")) {
    linkType = "image";
    if (contentType.includes("image/jpeg")) imageExtension = "jpeg";
    else if (contentType.includes("image/png")) imageExtension = "png";
  }

  await prisma.link.update({
    where: { id: linkId },
    data: {
      type: linkType,
    },
  });

  return { linkType, imageExtension };
}

// Construct browser launch options based on environment variables.
export function getBrowserOptions(): LaunchOptions {
  let browserOptions: LaunchOptions = {};

  if (process.env.PROXY) {
    browserOptions.proxy = {
      server: process.env.PROXY,
      bypass: process.env.PROXY_BYPASS,
      username: process.env.PROXY_USERNAME,
      password: process.env.PROXY_PASSWORD,
    };
  }

  if (process.env.PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH) {
    browserOptions.executablePath =
      process.env.PLAYWRIGHT_LAUNCH_OPTIONS_EXECUTABLE_PATH;
  }

  return browserOptions;
}

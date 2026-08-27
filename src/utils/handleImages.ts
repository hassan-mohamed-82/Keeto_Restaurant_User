import path from "path";
import fs from "fs/promises";
import { Request } from "express";
import { BadRequest } from "../Errors/BadRequest";
import { BASE64_IMAGE_REGEX } from "../types/constant";

export async function saveBase64Image(
  base64: string,
  req: Request,
  folder: string
): Promise<string> {
  const matches = base64.match(/^data:(.+);base64,(.+)$/);
  let ext = "png";
  let data = base64;

  if (matches && matches.length === 3) {
    const rawExt = matches[1].split("/")[1];
    // Sanitize extension to prevent path traversal
    ext = rawExt.replace(/[^a-zA-Z0-9]/g, "") || "png";
    data = matches[2];
  }

  const buffer = Buffer.from(data, "base64");
  const fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;

  const rootDir = path.resolve(__dirname, "../../");
  const uploadsDir = path.join(rootDir, "uploads", folder);

  try {
    await fs.mkdir(uploadsDir, { recursive: true });
    await fs.writeFile(path.join(uploadsDir, fileName), buffer);
  } catch (err) {
    console.error("❌ Failed to save image:", err);
    throw err;
  }

  // ✨ Handle HTTPS, proxy headers, and double-domain fixing
  let rawProtocol = req.get("x-forwarded-proto") || req.protocol || "https";
  let host = req.get("x-forwarded-host") || req.get("host") || "";

  // Fix domain doubling (e.g. keeto.org.keeto.org -> keeto.org)
  host = host.replace(/(\.[a-zA-Z0-9-]+\.[a-zA-Z]+)\1+/g, "$1");

  // Force HTTPS in production / remote environments
  if (!host.includes("localhost") && !host.includes("127.0.0.1")) {
    rawProtocol = "https";
  }

  const rawUrl = `${rawProtocol}://${host}/uploads/${folder}/${fileName}`;
  return sanitizeImageUrl(rawUrl) || rawUrl;
}

export function sanitizeImageUrl(url: string | null | undefined): string | null | undefined {
  if (!url || typeof url !== "string") return url;

  let sanitized = url;

  // 1. Remove doubled domain suffix
  sanitized = sanitized.replace(/(\.[a-zA-Z0-9-]+\.[a-zA-Z]+)\1+/g, "$1");

  // 2. Force HTTPS for non-localhost URLs
  if (sanitized.startsWith("http://") && !sanitized.includes("localhost") && !sanitized.includes("127.0.0.1")) {
    sanitized = sanitized.replace(/^http:\/\//i, "https://");
  }

  return sanitized;
}

export const validateAndSaveLogo = async (req: Request, logo: string, folder: string): Promise<string> => {
  if (!logo.match(BASE64_IMAGE_REGEX)) {
    throw new BadRequest("Invalid logo format. Must be a base64 encoded image (JPEG, PNG, GIF, or WebP)");
  }
  try {
    const savedUrl = await saveBase64Image(logo, req, folder);
    return savedUrl;
  } catch (error: any) {
    throw new BadRequest(`Failed to save logo: ${error.message}`);
  }
};

export const deleteImage = async (image: string) => {
  if (!image || image.includes("data:image") || image.length > 2000) {
    console.warn("Skipping deletion of likely base64 data in image field");
    return;
  }

  const rootDir = path.resolve(__dirname, "../../");
  let relativePath = image;
  if (image.includes("/uploads/")) {
    relativePath = "uploads/" + image.split("/uploads/")[1];
  }

  const imagePath = path.join(rootDir, relativePath);
  try {
    await fs.unlink(imagePath);
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      console.warn(`Image file not found for deletion: ${imagePath}`);
      return;
    }
    console.error(`Failed to delete image: ${error.message}`);
  }
};

export const handleImageUpdate = async (req: Request, oldImage: string | null | undefined, newImage: string | undefined, folder: string) => {
  if (!newImage || newImage.startsWith("http")) {
    return newImage || oldImage;
  }

  const savedUrl = await validateAndSaveLogo(req, newImage, folder);

  if (oldImage) {
    await deleteImage(oldImage);
  }

  return savedUrl;
};


// import path from "path";
// import fs from "fs/promises";
// import { Request } from "express";
// import sharp from "sharp";
// import { BadRequest } from "../Errors/BadRequest";
// import { BASE64_IMAGE_REGEX } from "../types/constant";

// export async function saveBase64Image(
//   base64: string,
//   req: Request,
//   folder: string
// ): Promise<string> {
//   const matches = base64.match(/^data:(.+);base64,(.+)$/);
//   let ext = "webp";
//   let data = base64;

//   if (matches && matches.length === 3) {
//     data = matches[2];
//   }

//   const buffer = Buffer.from(data, "base64");
//   let fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.webp`;

//   const rootDir = path.resolve(__dirname, "../../");
//   const uploadsDir = path.join(rootDir, "uploads", folder);
//   const filePath = path.join(uploadsDir, fileName);

//   try {
//     await fs.mkdir(uploadsDir, { recursive: true });
//     // Compress & convert to WebP with sharp (max width 1200px, quality 80%)
//     await sharp(buffer)
//       .resize(1200, null, { fit: "inside", withoutEnlargement: true })
//       .webp({ quality: 80 })
//       .toFile(filePath);
//   } catch (err) {
//     console.warn("⚠️ Sharp processing failed, falling back to raw buffer write:", err);
//     const fallbackExt = matches && matches[1] ? matches[1].split("/")[1]?.replace(/[^a-zA-Z0-9]/g, "") || "png" : "png";
//     fileName = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${fallbackExt}`;
//     await fs.writeFile(path.join(uploadsDir, fileName), buffer);
//   }

//   let rawProtocol = req.get("x-forwarded-proto") || req.protocol || "https";
//   let host = req.get("x-forwarded-host") || req.get("host") || "";

//   // Fix domain doubling (.keeto.org.keeto.org -> .keeto.org)
//   host = host.replace(/(\.[a-zA-Z0-9-]+\.[a-zA-Z]+)\1+/g, "$1");
//   host = host.replace(/\.keeto\.org\.keeto\.org/g, ".keeto.org");

//   // Enforce HTTPS in production / non-localhost environments
//   if (!host.includes("localhost") && !host.includes("127.0.0.1")) {
//     rawProtocol = "https";
//   }

//   const rawUrl = `${rawProtocol}://${host}/uploads/${folder}/${fileName}`;
//   return sanitizeImageUrl(rawUrl) || rawUrl;
// }

// export function sanitizeImageUrl(url: string | null | undefined): string | null | undefined {
//   if (!url || typeof url !== "string") return url;

//   let sanitized = url;

//   // 1. Remove doubled domain suffix (e.g. .keeto.org.keeto.org -> .keeto.org)
//   sanitized = sanitized.replace(/(\.[a-zA-Z0-9-]+\.[a-zA-Z]+)\1+/g, "$1");
//   sanitized = sanitized.replace(/\.keeto\.org\.keeto\.org/g, ".keeto.org");

//   // 2. Force https for non-localhost URLs
//   if (sanitized.startsWith("http://") && !sanitized.includes("localhost") && !sanitized.includes("127.0.0.1")) {
//     sanitized = sanitized.replace(/^http:\/\//i, "https://");
//   }

//   return sanitized;
// }

// export const validateAndSaveLogo = async (req: Request, logo: string, folder: string): Promise<string> => {
//   if (!logo.match(BASE64_IMAGE_REGEX)) {
//     throw new BadRequest("Invalid logo format. Must be a base64 encoded image (JPEG, PNG, GIF, or WebP)");
//   }
//   try {
//     const savedUrl = await saveBase64Image(logo, req, folder);
//     return savedUrl;
//   } catch (error: any) {
//     throw new BadRequest(`Failed to save logo: ${error.message}`);
//   }
// };

// export const deleteImage = async (image: string) => {
//   if (image.includes("data:image") || image.length > 2000) {
//     console.warn("Skipping deletion of likely base64 data in image field");
//     return;
//   }

//   const rootDir = path.resolve(__dirname, "../../");
//   let relativePath = image;
//   if (image.includes("/uploads/")) {
//     relativePath = "uploads/" + image.split("/uploads/")[1];
//   }

//   const imagePath = path.join(rootDir, relativePath);
//   try {
//     await fs.unlink(imagePath);
//   } catch (error: any) {
//     if (error.code === 'ENOENT') {
//       console.warn(`Image file not found for deletion: ${imagePath}`);
//       return;
//     }
//     console.error(`Failed to delete image: ${error.message}`);
//   }
// };

// export const handleImageUpdate = async (req: Request, oldImage: string | null | undefined, newImage: string | undefined, folder: string) => {
//   if (!newImage || newImage.startsWith("http")) {
//     return newImage || oldImage;
//   }

//   const savedUrl = await validateAndSaveLogo(req, newImage, folder);

//   if (oldImage) {
//     await deleteImage(oldImage);
//   }

//   return savedUrl;
// };
import { z } from "zod";

/**
 * Type of transformation to apply to an image.
 */
export type TransformationType =
  | "resize"
  | "blur"
  | "rotate"
  | "flip"
  | "grayscale"
  | "sepia"
  | "brightness"
  | "contrast"
  | "sharpen"
  | "watermark"
  | "logo"
  | "text";

// ============================================================================
// Basic Transformations
// ============================================================================

/**
 * Resize transformation parameters.
 * Resizes the image to the specified dimensions with the given fit mode.
 */
export const resizeTransformSchema = z.object({
  type: z.literal("resize"),
  /** Target width in pixels (optional) */
  width: z.number().positive().optional(),
  /** Target height in pixels (optional) */
  height: z.number().positive().optional(),
  /** How the image should fit within the specified dimensions */
  fit: z.enum(["contain", "cover", "fill"]),
});

export type ResizeTransform = z.infer<typeof resizeTransformSchema>;

/**
 * Blur transformation parameters.
 * Applies Gaussian blur to the image.
 */
export const blurTransformSchema = z.object({
  type: z.literal("blur"),
  /** Blur strength (sigma). Range: 0.3 to 1000 */
  sigma: z.number().min(0.3).max(1000),
});

export type BlurTransform = z.infer<typeof blurTransformSchema>;

/**
 * Rotate transformation parameters.
 * Rotates the image by the specified angle.
 */
export const rotateTransformSchema = z.object({
  type: z.literal("rotate"),
  /** Rotation angle in degrees. Positive values rotate clockwise. */
  angle: z.number(),
  /** Background color for exposed areas (optional, defaults to transparent) */
  background: z.string().optional(),
});

export type RotateTransform = z.infer<typeof rotateTransformSchema>;

/**
 * Flip transformation parameters.
 * Flips the image horizontally or vertically.
 */
export const flipTransformSchema = z.object({
  type: z.literal("flip"),
  /** Direction to flip the image */
  direction: z.enum(["horizontal", "vertical"]),
});

export type FlipTransform = z.infer<typeof flipTransformSchema>;

// ============================================================================
// Filter Transformations
// ============================================================================

/**
 * Grayscale transformation parameters.
 * Converts the image to grayscale.
 */
export const grayscaleTransformSchema = z.object({
  type: z.literal("grayscale"),
});

export type GrayscaleTransform = z.infer<typeof grayscaleTransformSchema>;

/**
 * Sepia transformation parameters.
 * Applies a sepia tone effect to the image.
 */
export const sepiaTransformSchema = z.object({
  type: z.literal("sepia"),
});

export type SepiaTransform = z.infer<typeof sepiaTransformSchema>;

/**
 * Brightness transformation parameters.
 * Adjusts the brightness of the image.
 */
export const brightnessTransformSchema = z.object({
  type: z.literal("brightness"),
  /** Brightness adjustment value. Range: -100 to +100. 0 = no change. */
  value: z.number().min(-100).max(100),
});

export type BrightnessTransform = z.infer<typeof brightnessTransformSchema>;

/**
 * Contrast transformation parameters.
 * Adjusts the contrast of the image.
 */
export const contrastTransformSchema = z.object({
  type: z.literal("contrast"),
  /** Contrast adjustment value. Range: -100 to +100. 0 = no change. */
  value: z.number().min(-100).max(100),
});

export type ContrastTransform = z.infer<typeof contrastTransformSchema>;

// ============================================================================
// Effect Transformations
// ============================================================================

/**
 * Sharpen transformation parameters.
 * Applies sharpening to the image.
 */
export const sharpenTransformSchema = z.object({
  type: z.literal("sharpen"),
  /** Sharpening strength (sigma). Optional, uses default if not specified. */
  sigma: z.number().positive().optional(),
});

export type SharpenTransform = z.infer<typeof sharpenTransformSchema>;

// ============================================================================
// Advanced Transformations
// ============================================================================

/**
 * Position for overlays (watermarks, logos, text).
 */
export type OverlayPosition =
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right"
  | "center";

/**
 * Watermark transformation parameters.
 * Overlays a watermark image on the main image.
 */
export const watermarkTransformSchema = z.object({
  type: z.literal("watermark"),
  /** URL to the watermark image file (e.g., https://example.com/watermark.png) */
  imagePath: z.string().min(1).url(),
  /** Position of the watermark on the image */
  position: z.enum([
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "center",
  ]),
  /** Opacity of the watermark. Range: 0 (transparent) to 1 (opaque) */
  opacity: z.number().min(0).max(1),
  /** Horizontal offset in pixels from the position anchor (optional) */
  offsetX: z.number().optional(),
  /** Vertical offset in pixels from the position anchor (optional) */
  offsetY: z.number().optional(),
});

export type WatermarkTransform = z.infer<typeof watermarkTransformSchema>;

/**
 * Logo transformation parameters.
 * Overlays a logo image on the main image with scaling.
 */
export const logoTransformSchema = z.object({
  type: z.literal("logo"),
  /** URL to the logo image file (e.g., https://example.com/logo.png) */
  imagePath: z.string().min(1).url(),
  /** Position of the logo on the image */
  position: z.enum([
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "center",
  ]),
  /** Scale factor for the logo. Range: 0.1 to 2.0 */
  scale: z.number().min(0.1).max(2.0),
  /** Horizontal offset in pixels from the position anchor (optional) */
  offsetX: z.number().optional(),
  /** Vertical offset in pixels from the position anchor (optional) */
  offsetY: z.number().optional(),
});

export type LogoTransform = z.infer<typeof logoTransformSchema>;

/**
 * Text transformation parameters.
 * Overlays text on the image.
 */
export const textTransformSchema = z.object({
  type: z.literal("text"),
  /** Text content to overlay */
  text: z.string().min(1),
  /** Position of the text on the image */
  position: z.enum([
    "top-left",
    "top-right",
    "bottom-left",
    "bottom-right",
    "center",
  ]),
  /** Font size in pixels */
  fontSize: z.number().positive(),
  /** Text color (hex code or named color) */
  color: z.string().min(1),
  /** Font family name (optional) */
  fontFamily: z.string().optional(),
  /** Horizontal offset in pixels from the position anchor (optional) */
  offsetX: z.number().optional(),
  /** Vertical offset in pixels from the position anchor (optional) */
  offsetY: z.number().optional(),
});

export type TextTransform = z.infer<typeof textTransformSchema>;

// ============================================================================
// Discriminated Union
// ============================================================================

/**
 * Schema for validating any transformation type.
 * This is a discriminated union of all transformation schemas.
 */
export const transformationSchema = z.discriminatedUnion("type", [
  resizeTransformSchema,
  blurTransformSchema,
  rotateTransformSchema,
  flipTransformSchema,
  grayscaleTransformSchema,
  sepiaTransformSchema,
  brightnessTransformSchema,
  contrastTransformSchema,
  sharpenTransformSchema,
  watermarkTransformSchema,
  logoTransformSchema,
  textTransformSchema,
]);

/**
 * A single image transformation operation.
 * This is a discriminated union type that can represent any transformation.
 */
export type Transformation = z.infer<typeof transformationSchema>;

// ============================================================================
// Transform Image Node Parameters
// ============================================================================

/**
 * Parameters for the transform image node.
 * Contains an ordered array of transformations to apply sequentially.
 */
export const transformImageParamsSchema = z.object({
  /** Ordered array of transformations to apply. Applied sequentially. */
  transformations: z.array(transformationSchema).min(1),
});

/**
 * Parameters for the transform image node.
 */
export type TransformImageParams = z.infer<typeof transformImageParamsSchema>;

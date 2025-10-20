export const round2dp = (num: number) =>
  Math.round((num + Number.EPSILON) * 100) / 100;

export const calculateImageSize = (
  objectFit: "contain" | "cover" | "fill" | "none" | "scale-down",
  currentWidth: number,
  currentHeight: number,
  containerWidth: number,
  containerHeight: number,
) => {
  let newSize: {
    width?: number;
    height?: number;
  } = {};

  switch (objectFit) {
    case "contain": {
      // Calculate dimensions while maintaining aspect ratio
      const widthRatioContain = containerWidth / currentWidth;
      const heightRatioContain = containerHeight / currentHeight;
      const scaleContain = Math.min(widthRatioContain, heightRatioContain);
      newSize = {
        width: currentWidth * scaleContain,
        height: currentHeight * scaleContain,
      };
      break;
    }
    case "cover": {
      // Calculate dimensions while maintaining aspect ratio
      const widthRatioCover = containerWidth / currentWidth;
      const heightRatioCover = containerHeight / currentHeight;
      const scaleCover = Math.max(widthRatioCover, heightRatioCover);
      const newWidthCover = currentWidth * scaleCover;
      const newHeightCover = currentHeight * scaleCover;
      // Adjust dimensions if it doesn't cover the container completely
      if (newWidthCover < containerWidth || newHeightCover < containerHeight) {
        const scaleCoverAdjusted = Math.max(
          containerWidth / currentWidth,
          containerHeight / currentHeight,
        );
        newSize = {
          width: currentWidth * scaleCoverAdjusted,
          height: currentHeight * scaleCoverAdjusted,
        };
        break;
      }
      newSize = {
        width: newWidthCover,
        height: newHeightCover,
      };
      break;
    }
    case "fill":
      // Stretch image to fill container
      newSize = {
        width: containerWidth,
        height: containerHeight,
      };
      break;
    case "none":
      // Keep original image size
      newSize = {
        width: currentWidth,
        height: currentHeight,
      };
      break;
    case "scale-down": {
      // Calculate dimensions based on contain and none values
      const widthRatioScaleDown = containerWidth / currentWidth;
      const heightRatioScaleDown = containerHeight / currentHeight;
      const scaleScaleDown = Math.min(
        1,
        Math.min(widthRatioScaleDown, heightRatioScaleDown),
      );
      newSize = {
        width: currentWidth * scaleScaleDown,
        height: currentHeight * scaleScaleDown,
      };
      break;
    }
    default:
      throw new Error("Invalid object fit value");
  }

  if (!newSize?.width || !newSize?.height) {
    throw new Error("Invalid dimensions");
  }

  return {
    width: round2dp(newSize.width),
    height: round2dp(newSize.height),
  };

  // return newSize;
};

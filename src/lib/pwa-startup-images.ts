const sizes = [
  [320, 568, 2],
  [375, 667, 2],
  [375, 812, 3],
  [390, 844, 3],
  [393, 852, 3],
  [402, 874, 3],
  [414, 736, 3],
  [414, 896, 2],
  [428, 926, 3],
  [430, 932, 3],
  [440, 956, 3],
];

export const startupImages = sizes.flatMap(([width, height, ratio]) =>
  ["portrait", "landscape"].map((orientation) => ({
    url: `/splash/${width}x${height}-${ratio}-${orientation}.png`,
    media: `(device-width: ${width}px) and (device-height: ${height}px) and (-webkit-device-pixel-ratio: ${ratio}) and (orientation: ${orientation})`,
  })),
);

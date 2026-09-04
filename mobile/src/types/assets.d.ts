// Metro resolves these at bundle time to a numeric asset id (or a { uri }
// object on web); TypeScript just needs to know the shape is importable.
declare module "*.png" {
  import type { ImageSourcePropType } from "react-native";
  const value: ImageSourcePropType;
  export default value;
}

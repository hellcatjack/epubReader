declare const __APP_BUILD_ID__: string | undefined;

export const APP_BUILD_ID = typeof __APP_BUILD_ID__ === "string" ? __APP_BUILD_ID__ : "dev";

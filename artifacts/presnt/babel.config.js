module.exports = function (api) {
  api.cache(true);
  return {
    presets: [["babel-preset-expo", { unstable_transformImportMeta: true }]],
    plugins: [
      [
        "module-resolver",
        {
          root: ["."],
          alias: {
            "@/components": "./components",
            "@/lib": "./lib",
            "@/stores": "./stores",
            "@/types": "./types",
            "@/hooks": "./hooks",
            "@/constants": "./constants",
            "@/app": "./app",
          },
        },
      ],
    ],
  };
};

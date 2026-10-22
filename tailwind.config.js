module.exports = {
  content: ["./public/index.html", "./public/widget.html"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        bgMain: "#FFFFFF",
        bgCard: "#F8FAFC",
        accentGold: "#C5A059",
        accentTech: "#0072CE",
        textPrimary: "#0A1A3A"
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
        title: ["Montserrat", "sans-serif"]
      },
      boxShadow: {
        "wa-card": "0 2px 8px rgba(0, 0, 0, 0.06)",
        "wa-float": "0 4px 20px rgba(0, 0, 0, 0.08), 0 0 10px rgba(197, 160, 89, 0.15)",
        "wa-bubble": "0 1px 3px rgba(0, 0, 0, 0.08)"
      }
    }
  }
};

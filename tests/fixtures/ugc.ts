export const ugcFixture = {
  title: "Kopi pagi, cerita baru",
  caption: "Mulai hari dengan satu langkah kecil. #CeritaUGC",
  hook: "Pagi kamu juga sering buru-buru?",
  synopsis:
    "Kreator menyadari rutinitasnya terburu-buru, menyiapkan kopi dengan tenang, lalu mengajak penonton bercerita.",
  characterLock:
    "Adult Indonesian creator, shoulder-length black hair, plain cream T-shirt, natural skin, seated at the same wooden kitchen table with a blue ceramic mug.",
  negativePrompt:
    "face morphing, extra fingers, warped mug, flicker, watermarks, generated text",
  scenes: [
    {
      title: "Pagi yang terburu-buru",
      narration: "Pagi kamu juga sering buru-buru?",
      textToImage:
        "Eye-level selfie close-up of the creator at the kitchen table, slightly tired expression, soft morning window light, blue mug visible.",
      imageToVideo:
        "Subtle handheld sway, natural blink, the creator glances at the mug then toward the lens.",
    },
    {
      title: "Berhenti sebentar",
      narration: "Aku coba berhenti sebentar sebelum mulai kerja.",
      textToImage:
        "Medium shot of the same creator seated at the wooden table, both hands resting beside the blue mug, quiet kitchen background.",
      imageToVideo:
        "Slow push-in as the creator takes a gentle breath and relaxes their shoulders.",
    },
    {
      title: "Satu langkah sederhana",
      narration: "Satu kopi hangat, lalu aku susun rencana hari ini.",
      textToImage:
        "Over-the-shoulder view of the creator holding the blue mug beside an open blank notebook, morning light on the wooden table.",
      imageToVideo:
        "The creator gently places the mug on the table, subtle steam rising, stable handheld framing.",
    },
    {
      title: "Ajak bercerita",
      narration: "Kalau kamu, ritual pagimu apa? Cerita, ya.",
      textToImage:
        "Friendly eye-level close-up, the same creator and cream shirt, warm natural smile, blue mug on the same table.",
      imageToVideo:
        "Small natural smile and nod toward the camera, hold the final frame, no scene change.",
    },
  ],
};

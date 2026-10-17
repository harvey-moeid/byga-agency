import { z } from "zod";

// Run before schema modules: Zod's optional JIT probes JavaScript eval.
z.config({ jitless: true });

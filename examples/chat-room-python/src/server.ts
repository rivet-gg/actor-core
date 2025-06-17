import { serve } from "@rivetkit/nodejs";
import { app } from "./workers/app";

serve(app);
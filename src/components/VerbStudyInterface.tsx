import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle, ArrowRight } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import { VirtualKeyboard } from "./VirtualKeyboard";

// If you need access to types that are only exported from page.tsx, 
// we might have to define them here or import if possible.
// For now, let's redefine minimal interfaces since it's hard to import from a Next.js page.
// Or we can just import from page if they are exported.

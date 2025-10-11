import { GoogleGenAI } from "@google/genai";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import { MedicationSchedule } from "../models/medicationSchedule.model.js";
import { DoseLog } from "../models/doseLog.model.js";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const sendMessage = asyncHandler(async (req, res) => {
  const { message } = req.body;
  const userId = req.user._id;

  // Assuming your authentication middleware attaches user details like fullName
  const userFullName = req.user.fullName || "Esteemed Alchemist";

  if (!message) throw new ApiError(400, "Message content is required."); //  DATA RETRIEVAL

  const schedules = await MedicationSchedule.find({ userId }).select(
    "name dosage frequency times startDate"
  );

  const recentLogs = await DoseLog.find({ userId })
    .sort({ scheduledFor: -1 })
    .limit(5)
    .select("scheduledFor status")
    .lean(); // Convert to plain JS objects for JSON.stringify

  const context = {
    activeSchedules: schedules,
    recentDoseHistory: recentLogs,
    currentDate: new Date().toISOString(),
  }; // PROMPT CONSTRUCTION

  const systemInstruction =
    "You are a **professional, factual, and helpful Health Assistant Chatbot**. Your core mission is to analyze the user's detailed medication schedule and dosage history (the data provided below) to provide **concise, direct, and actionable answers** to their questions. Always prioritize **clarity, simplicity, and safety**. Use plain, simple English. Never use a persona, fancy language, or any kind of mystical theme. Deliver the information as a standard, trustworthy health tool. If the user asks a general health question not related to their schedules, use the Google Search tool to find a factual answer."; // --- UPDATED USER PROMPT ---

  const userPrompt = `
Analyze the following patient data to answer the user's question clearly and concisely.

User Question: "${message}"

--- Patient Data for Analysis ---
- User Name: ${userFullName}
- Active Schedules: ${JSON.stringify(context.activeSchedules)}
- Recent Dose History (Last 5): ${JSON.stringify(context.recentDoseHistory)}
- Current Date/Time: ${context.currentDate}

Task: Answer the user's question.
1. SCHEDULE/DOSE QUESTION: Answer directly using the supplied data. Use **bullet points for clarity** if listing items (e.g., "You need to take...").
2. GENERAL HEALTH/SAFETY QUESTION: Use your general knowledge and the Google Search tool (if necessary) to provide a **factual, simple answer**.
3. TONE: Respond as a standard health assistant. Be **direct and helpful**. Do not write long paragraphs or use any fanciful language.
`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      config: {
        systemInstruction: systemInstruction,
        tools: [{ google_search: {} }],
      },
    });

    const aiResponse = response.text.trim();
    return res
      .status(200)
      .json(
        new ApiResponse(200, { response: aiResponse }, "AI response generated")
      );
  } catch (aiError) {
    console.log("Gemini API Error: ", aiError);
    throw new ApiError(
      500,
      "The Mystic Fortune Teller's crystal ball is cloudy. Try again."
    );
  }
});

export { sendMessage };

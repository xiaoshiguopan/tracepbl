export const gradeOptions = {
  初中: ["七年级", "八年级", "九年级"],
  高中: ["高一", "高二", "高三"],
} as const;

export const lessonTypeOptions = ["新授", "复习", "公开课 / 比赛", "微型 PBL"] as const;

export type Stage = keyof typeof gradeOptions;

export type TeachingContextDraft = {
  stage: Stage | "";
  grade: string;
  textbook: string;
  lesson: string;
  lessonTypes: string[];
  minutes: string;
  inquiryQuestion: string;
};

export type FieldErrors = Partial<Record<keyof TeachingContextDraft, string>>;

export const syntheticFixture: TeachingContextDraft = {
  stage: "高中",
  grade: "高一",
  textbook: "统编版《中外历史纲要（上）》",
  lesson: "第 6 课《从隋唐盛世到五代十国》",
  lessonTypes: ["新授", "微型 PBL"],
  minutes: "45",
  inquiryQuestion: "依据哪些史料，我们可以把唐朝前期称为“盛世”？",
};

export function normalizeTeachingContextDraft(value: TeachingContextDraft) {
  return {
    stage: value.stage,
    grade: value.grade,
    textbook: value.textbook,
    lesson: value.lesson,
    lessonTypes: Array.isArray(value.lessonTypes) ? value.lessonTypes : [],
    minutes: value.minutes,
    inquiryQuestion: typeof value.inquiryQuestion === "string" ? value.inquiryQuestion : "",
  } satisfies TeachingContextDraft;
}

const sensitivePattern = /(身份证|手机号|联系电话|学生姓名|班级名单|家庭住址)/;

export function validateTeachingContext(draft: TeachingContextDraft): FieldErrors {
  const errors: FieldErrors = {};
  if (!draft.textbook.trim()) errors.textbook = "请填写教材版本。";
  if (!draft.lesson.trim()) errors.lesson = "请填写单元或课次。";
  else if (draft.lesson.trim().length > 120) errors.lesson = "请将单元或课次控制在 120 字以内。";
  if (!draft.stage) errors.stage = "请选择学段。";
  if (!draft.grade) errors.grade = "请选择年级。";
  else if (draft.stage && !(gradeOptions[draft.stage] as readonly string[]).includes(draft.grade)) {
    errors.grade = "年级与学段不一致，请重新选择。";
  }
  const minutes = Number(draft.minutes);
  if (!draft.minutes || !Number.isInteger(minutes) || minutes < 1 || minutes > 180) {
    errors.minutes = "请输入 1—180 之间的整数分钟。";
  }
  if (draft.inquiryQuestion.trim().length > 160) errors.inquiryQuestion = "初步探究方向请控制在 160 字以内。";

  const freeText = [draft.textbook, draft.lesson, draft.inquiryQuestion].join(" ");
  if (sensitivePattern.test(freeText)) {
    errors.inquiryQuestion = "请移除姓名、联系方式或其他个人信息。";
  }
  return errors;
}

export function getContextConflict(draft: TeachingContextDraft) {
  const minutes = Number(draft.minutes);
  if (draft.lessonTypes.includes("微型 PBL") && minutes > 0 && minutes < 30) {
    return "当前课时少于 30 分钟。建议缩小探究范围，或取消“微型 PBL”课型。";
  }
  return null;
}

export function getContextSummary(draft: TeachingContextDraft) {
  return {
    classLine: [draft.stage, draft.grade, draft.lessonTypes.join(" / "), draft.minutes && `${draft.minutes} 分钟`]
      .filter(Boolean)
      .join(" · "),
    inquiryQuestion: draft.inquiryQuestion.trim() || "待补充",
  };
}

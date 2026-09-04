import { Annotation, END, START, StateGraph, interrupt, type BaseCheckpointSaver } from "@langchain/langgraph";

const ProposalState = Annotation.Root({
  taskId: Annotation<string>,
  inputLockVersion: Annotation<number>,
  frozen: Annotation<boolean>,
  retrievalHitIds: Annotation<string[]>,
  modelRunId: Annotation<string>,
  generatedRevisionId: Annotation<string>,
  validated: Annotation<boolean>,
  decisionId: Annotation<string>,
});
export type ProposalGraphState = typeof ProposalState.State;
export type ProposalGraphPorts = Readonly<{
  freeze: (state: ProposalGraphState) => Promise<{ frozen: true }>;
  retrieve: (state: ProposalGraphState) => Promise<{ retrievalHitIds: string[] }>;
  generateOnce: (state: ProposalGraphState) => Promise<{ modelRunId: string; generatedRevisionId: string }>;
  validate: (state: ProposalGraphState) => Promise<{ validated: true }>;
}>;

export function buildProposalGraph(ports: ProposalGraphPorts, checkpointer: BaseCheckpointSaver) {
  return new StateGraph(ProposalState)
    .addNode("freeze", ports.freeze)
    .addNode("retrieve", ports.retrieve)
    .addNode("generate", ports.generateOnce)
    .addNode("validate", ports.validate)
    .addNode("waitForTeacher", (state) => ({ decisionId: interrupt({ generatedRevisionId: state.generatedRevisionId, inputLockVersion: state.inputLockVersion }) as string }))
    .addEdge(START, "freeze").addEdge("freeze", "retrieve").addEdge("retrieve", "generate").addEdge("generate", "validate").addEdge("validate", "waitForTeacher").addEdge("waitForTeacher", END)
    .compile({ checkpointer });
}

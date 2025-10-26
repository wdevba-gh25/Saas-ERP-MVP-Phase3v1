import axios from 'axios';

export class PythonAiClient {
  private readonly AI_BASE = process.env.AI_BASE || 'http://localhost:8009';

  async getProjectContext(projectId: string) {
    const { data } = await axios.get(`${this.AI_BASE}/ai/context/project/${projectId}`);
    return data;
  }
}

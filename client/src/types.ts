export interface Submission {
  userName: string;
  contestTitle: string;
  problemShort: string;
  problemTitle: string;
  verdict: string;
  timestamp: number;
}

export interface UserData {
  id: number;
  name: string;
  solved: number;
  details: {
    title: string;
    solved: number;
    total: number;
    problems: {
      id: string;
      short: string;
      solved: boolean;
      verdict: string | null;
      penalty: number;
      globalSolvedCount: number;
    }[];
  }[];
}

export interface DeadlineData {
  deadline: string;
  deadlinePassedGif: string;
  requiredTasks: number;
  users: UserData[];
  submissions: Submission[];
  contestsCount: number;
  totalUsers: number;
}

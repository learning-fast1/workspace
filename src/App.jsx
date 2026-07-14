import { HashRouter, Routes, Route } from 'react-router-dom'
import Home from './components/Home.jsx'
import StudentList from './components/StudentList.jsx'
import StudentForm from './components/StudentForm.jsx'
import StudentProfile from './components/StudentProfile.jsx'
import GoalWizardForm from './components/GoalWizardForm.jsx'
import GoalDetail from './components/GoalDetail.jsx'
import SelectIndividualStudent from './components/SelectIndividualStudent.jsx'
import SelectGroupStudents from './components/SelectGroupStudents.jsx'
import TeachingMode from './components/TeachingMode.jsx'
import SessionHistory from './components/SessionHistory.jsx'
import Settings from './components/Settings.jsx'

// HashRouter: απαραίτητο για GitHub Pages ώστε refresh/deep links να δουλεύουν χωρίς server routing.
export default function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/students" element={<StudentList />} />
        <Route path="/students/new" element={<StudentForm mode="create" />} />
        <Route path="/students/:id" element={<StudentProfile />} />
        <Route path="/students/:id/edit" element={<StudentForm mode="edit" />} />
        <Route path="/students/:id/goals/new" element={<GoalWizardForm mode="create" />} />
        <Route path="/students/:id/goals/:goalId" element={<GoalDetail />} />
        <Route path="/students/:id/goals/:goalId/edit" element={<GoalWizardForm mode="edit" />} />
        <Route path="/teaching/individual" element={<SelectIndividualStudent />} />
        <Route path="/teaching/group" element={<SelectGroupStudents />} />
        <Route path="/teaching/session/:studentIds" element={<TeachingMode />} />
        <Route path="/sessions" element={<SessionHistory />} />
      </Routes>
    </HashRouter>
  )
}

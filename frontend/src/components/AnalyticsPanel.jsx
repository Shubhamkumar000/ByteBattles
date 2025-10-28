import { useState, useEffect } from "react";
import axios from "axios";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart3, Users, Building2, Clock, TrendingUp } from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

export default function AnalyticsPanel() {
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const fetchAnalytics = async () => {
    try {
      const res = await axios.get(`${API}/analytics`);
      setAnalytics(res.data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="animate-pulse mb-6">
        <div className="h-40 bg-slate-200 rounded-lg"></div>
      </div>
    );
  }

  if (!analytics) return null;

  const topTeachers = Object.entries(analytics.teacher_workload || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topRooms = Object.entries(analytics.room_utilization || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const peakHours = Object.entries(analytics.peak_hours || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <div data-testid="analytics-panel" className="mb-6 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-blue-50 to-cyan-50 border-blue-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" />
              Total Classes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-blue-600">{analytics.total_classes}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-teal-50 border-green-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Free Slots
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-600">{analytics.free_slots}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-pink-50 border-purple-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <Users className="w-4 h-4" />
              Active Teachers
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-purple-600">
              {Object.keys(analytics.teacher_workload || {}).length}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-yellow-50 border-orange-200">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-slate-600 flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Rooms Used
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-orange-600">
              {Object.keys(analytics.room_utilization || {}).length}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="w-5 h-5 text-blue-600" />
              Top Teachers (Workload)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topTeachers.length > 0 ? (
              <div className="space-y-2">
                {topTeachers.map(([name, count], idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">{name}</span>
                    <span className="text-sm font-bold text-blue-600">{count} classes</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-5 h-5 text-teal-600" />
              Top Rooms (Utilization)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {topRooms.length > 0 ? (
              <div className="space-y-2">
                {topRooms.map(([name, count], idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">{name}</span>
                    <span className="text-sm font-bold text-teal-600">{count} classes</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No data available</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-orange-600" />
              Peak Hours
            </CardTitle>
          </CardHeader>
          <CardContent>
            {peakHours.length > 0 ? (
              <div className="space-y-2">
                {peakHours.map(([time, count], idx) => (
                  <div key={idx} className="flex justify-between items-center">
                    <span className="text-sm font-medium text-slate-700">{time}</span>
                    <span className="text-sm font-bold text-orange-600">{count} classes</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No data available</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
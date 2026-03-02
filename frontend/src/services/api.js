import axios from "axios";

const API_BASE_URL =
  process.env.REACT_APP_API_URL || "http://localhost:5000";

export const fetchHistory = () =>
  axios.get(`${API_BASE_URL}/history`);

export const saveTask = (data) =>
  axios.post(`${API_BASE_URL}/history`, data);
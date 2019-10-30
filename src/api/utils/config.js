export const oneDayExpiryDate = () => {
  var currentDate = new Date();
  currentDate.setDate(currentDate.getDate() + 1);
  return currentDate.getTime();
};
export const superUserRoles = {
  superuser: "role",
  kibana_system: "role",
  logstash_system: "role",
  beats_system: "role",
  apm_system: "role",
  remote_monitoring_collector: "role",
  remote_monitoring_agent: "role"
};

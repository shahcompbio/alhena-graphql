export const oneDayExpiryDate = () => {
  var currentDate = new Date();
  currentDate.setDate(currentDate.getDate() + 1);
  return currentDate.getTime();
};

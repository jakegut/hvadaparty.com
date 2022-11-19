const formatDatetime = (datetime: string) => {
  const myDatetime = new Date(datetime);
  return (
    myDatetime.toLocaleDateString([], {
      year: "numeric",
      month: "long",
      day: "numeric",
    })
  );
};

export default formatDatetime;

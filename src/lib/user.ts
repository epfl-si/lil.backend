export function getUserString (user: UserInfo) {
  return `${user.name}${user.sciper ? ` (${user.sciper})` : ''}`;
}

export function extractSciper(user: string) {
  const start = user.indexOf("(");
  const end = user.indexOf(")");

  if (start === -1 || end === -1 || end < start) {
    return null;
  }

  return user.substring(start + 1, end);
}

export function getUserForMutation (contextUser: UserInfo, argsSciper: number | undefined | null, argsName: string | undefined | null) {
  let user: UserInfo = contextUser;
  if (contextUser.isAdmin && argsSciper && `${argsSciper}` !== contextUser.sciper) {
    user = {
      username: "",
      sciper: `${argsSciper}`,
      name: argsName ?? ''
    }
  }
  return user;
}

import {getPrismaForUser} from "../lib/auditablePrisma";
import {Code, getCodesByStatus, setLocationsRMMCode} from "../schema/types/location";
import {callRMM, getQueryString, getRoomFromApiByName, getUserFromApi} from "../lib/api";
import {sendEmailForRMM} from "../lib/email/mailer";

const cronUser: UserInfo = {
  username: 'LHD-cron'
};
const prisma = getPrismaForUser(cronUser);

/**
 * Check for all ToBeCreated codes
 *
 * For each code, notify Catalyse
 */
export async function createIntoRMM () {
  const createdCodesByUser: Record<string, string[]> = {};
  const errorCodesByUser: Record<string, string[]> = {};

  // Get details for each code from DB given its RMM status
  const codesToBeCreated: Code[] = await getCodesByStatus(prisma, 'ToBeCreated');
  for ( const codeToBeCreated of codesToBeCreated) {
    // Call api to get Site>Building>Floor given the room
    const room: { name: string; building: string; site: string; floor: string; } = await getRoomFromApiByName(codeToBeCreated.roomName);
    // Call RMM to create location
    const locationPayload: Record<string, string | number> = {
      site: room.site,
      building: room.building,
      floor: room.floor,
      room: room.name,
      roomType: codeToBeCreated.roomType
    };
    if (codeToBeCreated.locationName === 'storage') {
      locationPayload.sublocationName1 = codeToBeCreated.barcode;
    } else if (codeToBeCreated.locationName === 'shelf') {
      locationPayload.sublocationName1 = codeToBeCreated.parentNiv1;
      locationPayload.sublocationName2 = codeToBeCreated.barcode;
    } else if (codeToBeCreated.locationName === 'box') {
      locationPayload.sublocationName1 = codeToBeCreated.parentNiv2;
      locationPayload.sublocationName2 = codeToBeCreated.parentNiv1;
      locationPayload.sublocationName3 = codeToBeCreated.barcode;
    }

    if (codeToBeCreated.roomType === 'LAB') {
      const error = await createLocation(locationPayload, codeToBeCreated);
      if (error) {
        addCode(errorCodesByUser, codeToBeCreated.createdBy, `<b>${codeToBeCreated.barcode}</b>: ${error}`);
      } else {
        addCode(createdCodesByUser, codeToBeCreated.createdBy, codeToBeCreated.barcode);
      }
    } else {
      // Check in RMM if room already exists
      const roomInRMM = await callRMM('/epfl/erd-services/json/containersearch/search',
        {locations: `${room.site}>${room.building}>${room.floor}>${codeToBeCreated.roomName}`, status: 5, timezoneoffset: 0});
      if (roomInRMM.totalResults === null) {
        const message = `Room <b>${codeToBeCreated.roomName}</b> - (${codeToBeCreated.roomType}) can't be created in RMM.`;
        addCode(errorCodesByUser, codeToBeCreated.createdBy, message);

        await prisma.$transaction(async (tx) => {
          await setLocationsRMMCode(tx, codeToBeCreated.locationName, [codeToBeCreated.barcode], 'ErrorCreating', message);
        });
      } else {
        const error = await createLocation(locationPayload, codeToBeCreated);
        if (error) {
          addCode(errorCodesByUser, codeToBeCreated.createdBy, `<b>${codeToBeCreated.barcode}</b>: ${error}`);
        } else {
          addCode(createdCodesByUser, codeToBeCreated.createdBy, codeToBeCreated.barcode);
        }
      }
    }
  }

  for (const key in createdCodesByUser) {
    const user: any = await getUserFromApi(key);
    if (user.length == 0) return;
    const message = createdCodesByUser[key].join('<br/>');
    console.log(`Sending notification for Created: ${message}`);
    await sendEmailForRMM(`<br/><br/>${message}<br/><br/>`, "created", [user.persons[0].email]);
  }

  for (const key in errorCodesByUser) {
    const user: any = await getUserFromApi(key);
    if (user.length == 0) return;
    const message = errorCodesByUser[key].join('<br/>');
    console.log(`Sending notification for NotAllowedRooms: ${message}`);
    await sendEmailForRMM(`<br/><br/>${message}<br/><br/>`, "notAllowedRooms", [user.persons[0].email]);
  }
}

async function createLocation (location: Record<string, string | number>, code: Code) {
  const createdLocation = await callRMM('/epfl/erd-services/json/import/createLocation', location);
  if (createdLocation.status === 1 || createdLocation.message.indexOf(' exists') > -1) {
    console.log(createdLocation);
    // If code correctly created on RMM, or it already exists, change status on LIL to Created
    console.log(`${code.barcode} CREATED`);
    await prisma.$transaction(async (tx) => {
      await setLocationsRMMCode(tx, code.locationName, [code.barcode], 'Created');
    });
  } else {
    const error = createdLocation.message.substring(0, createdLocation.message.indexOf(';'));
    console.error(`Error while creating code: ${getQueryString(location, ' ')} - ${error}`);
    await prisma.$transaction(async (tx) => {
      await setLocationsRMMCode(tx, code.locationName, [code.barcode], 'ErrorCreating', error);
    });
    return error;
  }
}

function addCode(codesByUser: Record<string, string[]>, user: string, code: string) {
  if (!user) return;

  if (!codesByUser.hasOwnProperty(user)) {
    codesByUser[user] = [];
  }
  codesByUser[user].push(code);
}

createIntoRMM();

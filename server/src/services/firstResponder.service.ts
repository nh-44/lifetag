import { firstResponderRepository } from '../repositories/firstResponderRepository';
import { FirstResponderProfileDTO } from '../types/patient.types';
import { OrgType } from '@prisma/client';

export const firstResponderService = {
  getProfile: async (userId: string): Promise<FirstResponderProfileDTO> => {
    const responder = await firstResponderRepository.findByUserId(userId);
    if (!responder) throw { statusCode: 404, message: 'First responder not found' };
    
    return {
      userId: responder.userId,
      name: responder.name,
      occupation: responder.occupation,
      contactInfo: responder.contactInfo,
      agency: responder.agency,
      agencyId: responder.agencyId,
      organizationType: responder.organizationType === OrgType.GOVERNMENT ? 'Government' : (responder.organizationType === OrgType.PRIVATE ? 'Private' : 'Government Funded'),
      qualification: responder.qualification,
    };
  },

  updateProfile: async (userId: string, data: FirstResponderProfileDTO) => {
    const { userId: _userId, organizationType, ...updateData } = data;
    
    let orgType: OrgType = OrgType.GOVERNMENT;
    if (organizationType === 'Private') orgType = OrgType.PRIVATE;
    if (organizationType === 'Government Funded') orgType = OrgType.GOVERNMENT_FUNDED;

    const updated = await firstResponderRepository.update(userId, {
      ...updateData,
      organizationType: orgType,
    });
    
    return {
      userId: updated.userId,
      name: updated.name,
      occupation: updated.occupation,
      contactInfo: updated.contactInfo,
      agency: updated.agency,
      agencyId: updated.agencyId,
      organizationType: updated.organizationType === OrgType.GOVERNMENT ? 'Government' : (updated.organizationType === OrgType.PRIVATE ? 'Private' : 'Government Funded'),
      qualification: updated.qualification,
    };
  }
};

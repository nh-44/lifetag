import { doctorRepository } from '../repositories/doctorRepository';
import { DoctorProfileDTO } from '../types/patient.types';

export const doctorService = {
  getProfile: async (userId: string): Promise<DoctorProfileDTO> => {
    const doctor = await doctorRepository.findByUserId(userId);
    if (!doctor) throw { statusCode: 404, message: 'Doctor not found' };
    
    return {
      userId: doctor.userId,
      name: doctor.name,
      contactInfo: doctor.contactInfo,
      medicalLicenseNumber: doctor.medicalLicenseNumber,
      qualifications: doctor.qualifications,
      hospitalClinic: doctor.hospitalClinic,
      specialty: doctor.specialty,
      verified: doctor.verified,
    };
  },

  updateProfile: async (userId: string, data: Omit<DoctorProfileDTO, 'userId'>) => {
    const current = await doctorRepository.findByUserId(userId);
    if (!current) throw { statusCode: 404, message: 'Doctor not found' };
    // Verification vouches for a specific licence; changing it requires re-verification.
    const licenceChanged = data.medicalLicenseNumber !== current.medicalLicenseNumber;
    const updated = await doctorRepository.update(userId, {
      name: data.name,
      contactInfo: data.contactInfo,
      medicalLicenseNumber: data.medicalLicenseNumber,
      qualifications: data.qualifications,
      hospitalClinic: data.hospitalClinic,
      specialty: data.specialty,
      ...(licenceChanged ? { verified: false, verifiedAt: null } : {}),
    });
    
    return {
      userId: updated.userId,
      name: updated.name,
      contactInfo: updated.contactInfo,
      medicalLicenseNumber: updated.medicalLicenseNumber,
      qualifications: updated.qualifications,
      hospitalClinic: updated.hospitalClinic,
      specialty: updated.specialty,
      verified: updated.verified,
    };
  }
};

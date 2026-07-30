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
    };
  },

  updateProfile: async (userId: string, data: DoctorProfileDTO) => {
    const { userId: _userId, ...updateData } = data;
    const updated = await doctorRepository.update(userId, updateData);
    
    return {
      userId: updated.userId,
      name: updated.name,
      contactInfo: updated.contactInfo,
      medicalLicenseNumber: updated.medicalLicenseNumber,
      qualifications: updated.qualifications,
      hospitalClinic: updated.hospitalClinic,
      specialty: updated.specialty,
    };
  }
};
